import { NextResponse } from "next/server";
import {
  convertToModelMessages,
  streamText,
  type LanguageModel,
  type UIMessage,
} from "ai";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { ProjectIdSchema } from "@/src/modules/delimitation/delimitation.schema";
import {
  DelimitationChatRequestSchema,
  coerceDelimitationChatDraft,
} from "@/src/modules/delimitation/delimitation-chat.schema";
import { buildDelimitationChatSystemPrompt } from "@/src/modules/delimitation/delimitation-chat.prompts";
import {
  analyzeChatGuardrails,
  buildChatGuardrailNotice,
  extractLatestUserText,
  sanitizeChatMessagesForModel,
  sanitizeDraftForAI,
} from "@/src/modules/delimitation/delimitation-guardrails";
import {
  buildRateLimitHeaders,
  checkMemoryRateLimit,
} from "@/src/lib/ai-rate-limit";
import { getClientAddress, getRequestId, getUserAgent } from "@/src/lib/request-meta";
import { logAiEvent, serializeError } from "@/src/lib/ai-logger";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const AI_ATTEMPT_TIMEOUT_MS = 8_000;

function resolveGatewayModel() {
  return (
    process.env.DELIMITATION_CHAT_MODEL ||
    "anthropic/claude-sonnet-4.6"
  );
}

async function resolveGoogleAiStudioModel() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;

  const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
  const google = createGoogleGenerativeAI({ apiKey });
  return google(process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite");
}

function resolveGoogleAiStudioModelName() {
  return process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";
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

    if (!process.env.AI_GATEWAY_API_KEY && !process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        {
          ok: false,
          error: "No hay un proveedor de IA configurado en el entorno del proyecto.",
        },
        { status: 500 }
      );
    }

    const rate = checkMemoryRateLimit({
      namespace: "delimitation-chat",
      key: `${pid.data}:${user.id}`,
      limit: Number(process.env.DELIMITATION_CHAT_RATE_LIMIT ?? 12),
      windowMs: Number(process.env.DELIMITATION_CHAT_RATE_WINDOW_MS ?? 60_000),
    });

    if (rate.limited) {
      logAiEvent("warn", "chat.rate_limited", {
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

    const parsed = DelimitationChatRequestSchema.safeParse(body);
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
      coerceDelimitationChatDraft(parsed.data.draft)
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

    logAiEvent("info", "chat.request", {
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

    const modelMessages = await convertToModelMessages(messages);
    const system = buildDelimitationChatSystemPrompt({
      draft,
      heuristics: parsed.data.heuristics,
      guardrailNote,
    });

    async function runChatAttempt(model: LanguageModel, modelName: string) {
      const result = streamText({
        model,
        system,
        messages: modelMessages,
        temperature:
          guardrailFlags.injectionRisk || guardrailFlags.wantsFinalAnswer
            ? 0.2
            : 0.4,
        maxOutputTokens: 320,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(AI_ATTEMPT_TIMEOUT_MS),
        onFinish(event) {
          logAiEvent("info", "chat.finish", {
            requestId,
            projectId: pid.data,
            clientIp,
            durationMs: Date.now() - startedAt,
            finishReason: event.finishReason,
            usage: event.usage,
            model: modelName,
          });
        },
        onError(event) {
          logAiEvent("error", "chat.stream_error", {
            requestId,
            projectId: pid.data,
            clientIp,
            durationMs: Date.now() - startedAt,
            model: modelName,
            error: serializeError(event.error),
          });
        },
      });

      await result.text;
      return result;
    }

    const googleAiStudioModel = await resolveGoogleAiStudioModel();
    let result;

    if (process.env.AI_GATEWAY_API_KEY) {
      try {
        result = await runChatAttempt(
          resolveGatewayModel(),
          resolveGatewayModel()
        );
      } catch (gatewayError) {
        if (!googleAiStudioModel) throw gatewayError;

        logAiEvent("warn", "chat.google_ai_studio_fallback", {
          requestId,
          projectId: pid.data,
          fromModel: resolveGatewayModel(),
          toModel: resolveGoogleAiStudioModelName(),
          error: serializeError(gatewayError),
        });

        result = await runChatAttempt(
          googleAiStudioModel,
          `google-ai-studio/${resolveGoogleAiStudioModelName()}`
        );
      }
    } else if (googleAiStudioModel) {
      result = await runChatAttempt(
        googleAiStudioModel,
        `google-ai-studio/${resolveGoogleAiStudioModelName()}`
      );
    } else {
      throw new Error("No hay un proveedor de IA disponible.");
    }

    return result.toUIMessageStreamResponse({
      headers: buildRateLimitHeaders(rate),
      originalMessages: messages,
      onError(error) {
        logAiEvent("error", "chat.ui_stream_error", {
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

    logAiEvent("error", "chat.route_error", {
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
