import { NextResponse } from "next/server";
import {
  convertToModelMessages,
  streamText,
  type UIMessage,
} from "ai";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { ProjectIdSchema } from "@/src/modules/research-design/research-design.schema";
import {
  ResearchDesignChatRequestSchema,
  coerceResearchDesignChatDraft,
} from "@/src/modules/research-design/research-design-chat.schema";
import { buildResearchDesignChatSystemPrompt } from "@/src/modules/research-design/research-design-chat.prompts";
import {
  analyzeChatGuardrails,
  buildChatGuardrailNotice,
  extractLatestUserText,
  sanitizeChatMessagesForModel,
  sanitizeDraftForAI,
} from "@/src/modules/research-design/research-design-chat.guardrails";
import {
  buildRateLimitHeaders,
  checkMemoryRateLimit,
} from "@/src/lib/ai-rate-limit";
import {
  getClientAddress,
  getRequestId,
  getUserAgent,
} from "@/src/lib/request-meta";
import { logAiEvent, serializeError } from "@/src/lib/ai-logger";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function resolveGatewayModel() {
  return (
    process.env.RESEARCH_DESIGN_CHAT_MODEL ||
    process.env.DELIMITATION_CHAT_MODEL ||
    "anthropic/claude-sonnet-4.6"
  );
}

function resolveChatRateLimit() {
  return Number(
    process.env.RESEARCH_DESIGN_CHAT_RATE_LIMIT ??
      process.env.DELIMITATION_CHAT_RATE_LIMIT ??
      12
  );
}

function resolveChatWindowMs() {
  return Number(
    process.env.RESEARCH_DESIGN_CHAT_RATE_WINDOW_MS ??
      process.env.DELIMITATION_CHAT_RATE_WINDOW_MS ??
      60_000
  );
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const requestId = getRequestId(req);
  const clientIp = getClientAddress(req);
  const userAgent = getUserAgent(req);
  const startedAt = Date.now();

  try {
    const { id } = await ctx.params;

    const pid = ProjectIdSchema.safeParse(id);
    if (!pid.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid project id" },
        { status: 400 }
      );
    }

    const { user } = await requireProjectRole(pid.data, [
      "owner",
      "editor",
      "viewer",
    ]);

    if (!process.env.AI_GATEWAY_API_KEY) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "AI_GATEWAY_API_KEY no está configurada en el entorno del proyecto.",
        },
        { status: 500 }
      );
    }

    const rate = checkMemoryRateLimit({
      namespace: "research-design-chat",
      key: `${pid.data}:${user.id}`,
      limit: resolveChatRateLimit(),
      windowMs: resolveChatWindowMs(),
    });

    if (rate.limited) {
      logAiEvent("warn", "research_design.chat.rate_limited", {
        requestId,
        projectId: pid.data,
        clientIp,
        userAgent,
        retryAfterSec: rate.retryAfterSec,
      });

      return NextResponse.json(
        {
          ok: false,
          error:
            "Has alcanzado el límite temporal del chat. Espera un momento antes de volver a enviar otra pregunta.",
        },
        {
          status: 429,
          headers: buildRateLimitHeaders(rate),
        }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const parsed = ResearchDesignChatRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Validation error",
          details: parsed.error.flatten(),
        },
        { status: 400, headers: buildRateLimitHeaders(rate) }
      );
    }

    const draft = sanitizeDraftForAI(
      coerceResearchDesignChatDraft(parsed.data.draft)
    );

    const messages = sanitizeChatMessagesForModel(
      (parsed.data.messages as UIMessage[]) ?? []
    );

    const latestUserText = extractLatestUserText(messages);

    if (!latestUserText) {
      return NextResponse.json(
        {
          ok: false,
          error: "No se encontró una pregunta válida para Jack.",
        },
        { status: 400, headers: buildRateLimitHeaders(rate) }
      );
    }

    const guardrailFlags = analyzeChatGuardrails(latestUserText);
    const guardrailNote = buildChatGuardrailNotice(guardrailFlags);

    logAiEvent("info", "research_design.chat.request", {
      requestId,
      projectId: pid.data,
      clientIp,
      userAgent,
      messageCount: messages.length,
      latestUserChars: latestUserText.length,
      rateRemaining: rate.remaining,
      guardrailFlags,
      model: resolveGatewayModel(),
    });

    const result = streamText({
      model: resolveGatewayModel(),
      system: buildResearchDesignChatSystemPrompt({
        draft,
        heuristics: parsed.data.heuristics,
        guardrailNote,
      }),
      messages: await convertToModelMessages(messages),
      temperature:
        guardrailFlags.injectionRisk || guardrailFlags.wantsFinalAnswer
          ? 0.2
          : 0.4,
      maxOutputTokens: 320,
      onFinish(event) {
        logAiEvent("info", "research_design.chat.finish", {
          requestId,
          projectId: pid.data,
          clientIp,
          durationMs: Date.now() - startedAt,
          finishReason: event.finishReason,
          usage: event.usage,
        });
      },
      onError(event) {
        logAiEvent("error", "research_design.chat.stream_error", {
          requestId,
          projectId: pid.data,
          clientIp,
          durationMs: Date.now() - startedAt,
          error: serializeError(event.error),
        });
      },
    });

    return result.toUIMessageStreamResponse({
      headers: buildRateLimitHeaders(rate),
      originalMessages: messages,
      onError(error) {
        logAiEvent("error", "research_design.chat.ui_stream_error", {
          requestId,
          projectId: pid.data,
          clientIp,
          error: serializeError(error),
        });

        return "Ocurrió un error al responder. Intenta de nuevo en un momento.";
      },
    });
  } catch (e: unknown) {
    const routeError = e as { message?: string; status?: number };

    logAiEvent("error", "research_design.chat.route_error", {
      requestId,
      clientIp,
      userAgent,
      durationMs: Date.now() - startedAt,
      error: serializeError(e),
    });

    return NextResponse.json(
      { ok: false, error: routeError?.message ?? "Unknown error" },
      { status: routeError?.status ?? 500 }
    );
  }
}
