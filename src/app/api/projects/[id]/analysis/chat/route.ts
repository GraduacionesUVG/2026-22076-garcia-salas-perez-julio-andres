import { NextResponse } from "next/server";
import { convertToModelMessages, gateway, streamText, type UIMessage } from "ai";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { ProjectIdSchema } from "@/src/modules/projects/projects.schema";
import { AnalysisChatRequestSchema } from "@/src/modules/analysis/analysis-chat.schema";
import { buildAnalysisChatSystemPrompt } from "@/src/modules/analysis/analysis-chat.prompts";
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
  return process.env.ANALYSIS_CHAT_MODEL || "openai/gpt-4o-mini";
}

function resolveChatRateLimit() {
  return Number(
    process.env.ANALYSIS_CHAT_RATE_LIMIT ??
      process.env.RESEARCH_DESIGN_CHAT_RATE_LIMIT ??
      process.env.DELIMITATION_CHAT_RATE_LIMIT ??
      12
  );
}

function resolveChatWindowMs() {
  return Number(
    process.env.ANALYSIS_CHAT_RATE_WINDOW_MS ??
      process.env.RESEARCH_DESIGN_CHAT_RATE_WINDOW_MS ??
      process.env.DELIMITATION_CHAT_RATE_WINDOW_MS ??
      60_000
  );
}

function getMessageText(message: UIMessage) {
  if (!Array.isArray(message?.parts)) return "";

  return message.parts
    .filter((part) => {
      const maybeText = part as { type?: string; text?: unknown };
      return maybeText?.type === "text" && typeof maybeText?.text === "string";
    })
    .map((part) => (part as { text: string }).text)
    .join("");
}

function sanitizeMessages(messages: UIMessage[]) {
  return messages
    .filter((message) => message?.role === "user" || message?.role === "assistant")
    .slice(-12)
    .map((message) => ({
      ...message,
      parts: Array.isArray(message.parts)
        ? message.parts
            .filter(
              (part) => {
                const maybeText = part as { type?: string; text?: unknown };
                return (
                  maybeText?.type === "text" &&
                  typeof maybeText?.text === "string"
                );
              }
            )
            .map((part) => ({
              ...part,
              text: (part as { text: string }).text.slice(0, 2000),
            }))
        : [],
    })) as UIMessage[];
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
        { ok: false, error: "INVALID_PROJECT_ID" },
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
      namespace: "analysis-chat",
      key: `${pid.data}:${user.id}`,
      limit: resolveChatRateLimit(),
      windowMs: resolveChatWindowMs(),
    });

    if (rate.limited) {
      logAiEvent("warn", "analysis.chat.rate_limited", {
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

    const parsed = AnalysisChatRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "VALIDATION_ERROR",
          details: parsed.error.flatten(),
        },
        { status: 400, headers: buildRateLimitHeaders(rate) }
      );
    }

    const messages = sanitizeMessages(
      (parsed.data.messages as UIMessage[]) ?? []
    );
    const latestUserText = [...messages]
      .reverse()
      .find((message) => message.role === "user");

    if (!latestUserText || !getMessageText(latestUserText).trim()) {
      return NextResponse.json(
        {
          ok: false,
          error: "No se encontró una pregunta válida para Jack.",
        },
        { status: 400, headers: buildRateLimitHeaders(rate) }
      );
    }

    logAiEvent("info", "analysis.chat.request", {
      requestId,
      projectId: pid.data,
      clientIp,
      userAgent,
      messageCount: messages.length,
      latestUserChars: getMessageText(latestUserText).length,
      rateRemaining: rate.remaining,
      model: resolveGatewayModel(),
      visualId: parsed.data.visualContext?.id,
      visualTitle: parsed.data.visualContext?.title,
    });

    const result = streamText({
      model: gateway(resolveGatewayModel()),
      system: buildAnalysisChatSystemPrompt({
        visualContext: parsed.data.visualContext,
      }),
      messages: await convertToModelMessages(messages),
      temperature: 0.35,
      maxOutputTokens: 360,
      onFinish(event) {
        logAiEvent("info", "analysis.chat.finish", {
          requestId,
          projectId: pid.data,
          clientIp,
          durationMs: Date.now() - startedAt,
          finishReason: event.finishReason,
          usage: event.usage,
        });
      },
      onError(event) {
        logAiEvent("error", "analysis.chat.stream_error", {
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
        logAiEvent("error", "analysis.chat.ui_stream_error", {
          requestId,
          projectId: pid.data,
          clientIp,
          error: serializeError(error),
        });

        return "Ocurrió un error al responder. Intenta de nuevo en un momento.";
      },
    });
  } catch (e: unknown) {
    const error = e as { message?: string; status?: number };
    logAiEvent("error", "analysis.chat.route_error", {
      requestId,
      clientIp,
      userAgent,
      durationMs: Date.now() - startedAt,
      error: serializeError(e),
    });

    return NextResponse.json(
      { ok: false, error: error?.message ?? "Unknown error" },
      { status: error?.status ?? 500 }
    );
  }
}
