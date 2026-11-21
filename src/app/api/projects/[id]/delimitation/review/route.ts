import { NextResponse } from "next/server";
import { generateText, Output, type LanguageModel } from "ai";
import { runReviewWithFallback } from "@/src/lib/ai-review-fallback";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { ProjectIdSchema } from "@/src/modules/delimitation/delimitation.schema";
import {
  DelimitationReviewOutputSchema,
  DelimitationReviewRequestSchema,
  coerceDelimitationReviewDraft,
} from "@/src/modules/delimitation/delimitation-review.schema";
import { buildDelimitationReviewPrompt } from "@/src/modules/delimitation/delimitation-review.prompts";
import { buildHeuristicDelimitationReview } from "@/src/modules/delimitation/delimitation-review.fallback";
import {
  applyReviewOutputGuardrails,
  buildReviewGuardrailNote,
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

const REVIEW_OUTPUT_TOKEN_LIMITS = [2400, 3200] as const;
const REVIEW_PRIMARY_TOKEN_LIMITS = [2400] as const;
const DEFAULT_REVIEW_FALLBACK_MODELS = [
  "inclusionai/ling-3.0-tiny-free",
  "poolside/laguna-s-2.1-free",
] as const;
const REVIEW_INCOMPLETE_MESSAGE =
  "La evaluación no pudo completarse. Intenta nuevamente en unos segundos.";
const PLAIN_JSON_REVIEW_INSTRUCTIONS = `
Devuelve exclusivamente JSON válido, sin Markdown, comentarios ni texto adicional.
Usa exactamente esta estructura:
{
  "summary": "string",
  "overall": {
    "score": 0,
    "verdict": "muy_amplia | mejorable | bien_delimitada",
    "rationale": "string"
  },
  "fields": {
    "topic": { "score": 0, "status": "pendiente | amplio | aceptable | bien_delimitado", "note": "string", "priority": "alta | media | baja" },
    "context_place": { "score": 0, "status": "pendiente | amplio | aceptable | bien_delimitado", "note": "string", "priority": "alta | media | baja" },
    "time_period": { "score": 0, "status": "pendiente | amplio | aceptable | bien_delimitado", "note": "string", "priority": "alta | media | baja" },
    "population": { "score": 0, "status": "pendiente | amplio | aceptable | bien_delimitado", "note": "string", "priority": "alta | media | baja" },
    "resources": { "score": 0, "status": "pendiente | amplio | aceptable | bien_delimitado", "note": "string", "priority": "alta | media | baja" },
    "include": { "score": 0, "status": "pendiente | amplio | aceptable | bien_delimitado", "note": "string", "priority": "alta | media | baja" },
    "exclude": { "score": 0, "status": "pendiente | amplio | aceptable | bien_delimitado", "note": "string", "priority": "alta | media | baja" }
  },
  "findings": [
    { "field": "topic | context_place | time_period | population | resources | include | exclude | overall", "kind": "riesgo | mejora | fortaleza", "severity": "alta | media | baja", "title": "string", "message": "string", "suggestion": "string" }
  ],
  "jackQuestion": "string",
  "suggestedNextStep": "string"
}
Todos los score deben ser enteros entre 0 y 100. Respeta los límites de longitud solicitados.
`.trim();

type ReviewRouteError = Error & {
  status?: number;
  code?: string;
};

function resolveGatewayModel() {
  return (
    process.env.DELIMITATION_REVIEW_MODEL ||
    process.env.DELIMITATION_CHAT_MODEL ||
    "anthropic/claude-sonnet-4.6"
  );
}

function resolveGoogleAiStudioModelName() {
  return process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";
}

function resolveGatewayModels() {
  const configuredFallbacks =
    process.env.DELIMITATION_REVIEW_FALLBACK_MODELS;
  const fallbackModels =
    configuredFallbacks === undefined
      ? [...DEFAULT_REVIEW_FALLBACK_MODELS]
      : configuredFallbacks
          .split(",")
          .map((model) => model.trim())
          .filter(Boolean);

  return [...new Set([resolveGatewayModel(), ...fallbackModels])];
}

function reviewProviderOptions(model: string) {
  if (!model.startsWith("google/")) return undefined;

  return {
    google: {
      thinkingConfig: {
        thinkingBudget: 0,
        includeThoughts: false,
      },
    },
  };
}

function usesNativeStructuredOutput(model: string) {
  return !model.endsWith("-free");
}

function buildPlainJsonReviewPrompt(prompt: string) {
  return `${prompt}\n\n${PLAIN_JSON_REVIEW_INSTRUCTIONS}`;
}

function parsePlainJsonReview(text: string) {
  const trimmed = String(text ?? "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const objectStart = trimmed.indexOf("{");
  const objectEnd = trimmed.lastIndexOf("}");

  if (objectStart < 0 || objectEnd <= objectStart) return null;

  try {
    const parsed = JSON.parse(trimmed.slice(objectStart, objectEnd + 1));
    const validated = DelimitationReviewOutputSchema.safeParse(parsed);
    return validated.success ? validated.data : null;
  } catch {
    return null;
  }
}

function incompleteReviewError() {
  const error = new Error(REVIEW_INCOMPLETE_MESSAGE) as ReviewRouteError;
  error.status = 502;
  error.code = "DELIMITATION_REVIEW_INCOMPLETE";
  return error;
}

function reviewErrorStatus(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }

  return 500;
}

function reviewErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

function isRestrictedGatewayModelError(error: unknown) {
  if (typeof error !== "object" || error === null) return false;

  const candidate = error as {
    name?: unknown;
    type?: unknown;
    statusCode?: unknown;
    message?: unknown;
    responseBody?: unknown;
  };
  const details = `${String(candidate.message ?? "")} ${String(
    candidate.responseBody ?? ""
  )}`;

  return (
    candidate.name === "RestrictedModelsError" ||
    candidate.type === "restricted_model" ||
    (candidate.statusCode === 403 &&
      /free tier users do not have access to this model|restrictedmodelserror/i.test(
        details
      ))
  );
}

function isGatewayCapacityError(error: unknown) {
  if (isRestrictedGatewayModelError(error)) return true;
  if (typeof error !== "object" || error === null) return false;

  const candidate = error as {
    name?: unknown;
    type?: unknown;
    statusCode?: unknown;
  };

  return (
    candidate.name === "GatewayRateLimitError" ||
    candidate.type === "rate_limit_exceeded" ||
    candidate.statusCode === 429
  );
}

function gatewayFallbackReason(error: unknown) {
  if (isRestrictedGatewayModelError(error)) {
    return "restricted_model";
  }

  return "gateway_rate_limit";
}

function isIncompleteStructuredOutputError(error: unknown) {
  const candidate = error as { name?: unknown; message?: unknown };
  const name = String(candidate?.name ?? "");
  const message = String(candidate?.message ?? "");

  return (
    name === "AI_NoOutputGeneratedError" ||
    name === "AI_NoObjectGeneratedError" ||
    /no (output|object) generated/i.test(message)
  );
}

async function generateStructuredReview({
  models,
  tokenLimits = REVIEW_OUTPUT_TOKEN_LIMITS,
  prompt,
  requestId,
  projectId,
  signal,
}: {
  models: string[];
  tokenLimits?: readonly number[];
  prompt: string;
  requestId: string;
  projectId: string;
  signal: AbortSignal;
}) {
  let lastCapacityError: unknown;
  let sawIncompleteOutput = false;

  for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
    const model = models[modelIndex];

    for (
      let attemptIndex = 0;
      attemptIndex < tokenLimits.length;
      attemptIndex += 1
    ) {
      signal.throwIfAborted();
      const maxOutputTokens = tokenLimits[attemptIndex];
      const nativeStructuredOutput = usesNativeStructuredOutput(model);

      try {
        const result = nativeStructuredOutput
          ? await generateText({
              model,
              prompt,
              temperature: 0.2,
              maxOutputTokens,
              maxRetries: 0,
              abortSignal: signal,
              providerOptions: reviewProviderOptions(model),
              output: Output.object({
                schema: DelimitationReviewOutputSchema,
              }),
            })
          : await generateText({
              model,
              prompt: buildPlainJsonReviewPrompt(prompt),
              temperature: 0.2,
              maxOutputTokens,
              maxRetries: 0,
              abortSignal: signal,
              providerOptions: reviewProviderOptions(model),
            });

        if (result.finishReason !== "stop") {
          sawIncompleteOutput = true;
          logAiEvent("warn", "review.incomplete_output", {
            requestId,
            projectId,
            model,
            attempt: attemptIndex + 1,
            finishReason: result.finishReason,
            maxOutputTokens,
          });
          continue;
        }

        const rawReviewOutput = nativeStructuredOutput
          ? result.output
          : parsePlainJsonReview(result.text);
        const validatedReviewOutput =
          DelimitationReviewOutputSchema.safeParse(rawReviewOutput);
        const reviewOutput = validatedReviewOutput.success
          ? validatedReviewOutput.data
          : null;

        if (!reviewOutput) {
          sawIncompleteOutput = true;
          logAiEvent("warn", "review.invalid_text_json_output", {
            requestId,
            projectId,
            model,
            attempt: attemptIndex + 1,
            maxOutputTokens,
            textLength: result.text?.length ?? 0,
          });
          continue;
        }

        return { output: reviewOutput, model };
      } catch (error) {
        if (isGatewayCapacityError(error)) {
          lastCapacityError = error;
          logAiEvent("warn", "review.gateway_model_unavailable", {
            requestId,
            projectId,
            model,
            attempt: attemptIndex + 1,
            reason: gatewayFallbackReason(error),
            error: serializeError(error),
          });
          break;
        }

        if (!isIncompleteStructuredOutputError(error)) {
          throw error;
        }

        sawIncompleteOutput = true;
        logAiEvent("warn", "review.invalid_structured_output", {
          requestId,
          projectId,
          model,
          attempt: attemptIndex + 1,
          maxOutputTokens,
          error: serializeError(error),
        });
      }
    }

    if (modelIndex < models.length - 1) {
      logAiEvent("info", "review.gateway_model_fallback", {
        requestId,
        projectId,
        fromModel: model,
        toModel: models[modelIndex + 1],
      });
    }
  }

  if (!sawIncompleteOutput && lastCapacityError) {
    throw lastCapacityError;
  }

  throw incompleteReviewError();
}

async function generateGoogleAiStudioReview({
  model,
  prompt,
  signal,
}: {
  model: LanguageModel;
  prompt: string;
  signal: AbortSignal;
}) {
  const result = await generateText({
    model,
    prompt,
    temperature: 0.2,
    maxOutputTokens: REVIEW_PRIMARY_TOKEN_LIMITS[0],
    maxRetries: 0,
    abortSignal: signal,
    output: Output.object({
      schema: DelimitationReviewOutputSchema,
    }),
  });

  if (result.finishReason !== "stop") {
    throw incompleteReviewError();
  }

  const validated = DelimitationReviewOutputSchema.safeParse(result.output);
  if (!validated.success) {
    throw incompleteReviewError();
  }

  return validated.data;
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

    await requireProjectRole(pid.data, ["owner", "editor", "viewer"]);

    const rate = checkMemoryRateLimit({
      namespace: "delimitation-review",
      key: `${pid.data}:${clientIp}`,
      limit: Number(process.env.DELIMITATION_REVIEW_RATE_LIMIT ?? 4),
      windowMs: Number(
        process.env.DELIMITATION_REVIEW_RATE_WINDOW_MS ?? 300_000
      ),
    });

    if (rate.limited) {
      logAiEvent("warn", "review.rate_limited", {
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
            "Has alcanzado el límite temporal de evaluaciones. Espera un momento antes de volver a evaluar la delimitación.",
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

    const parsed = DelimitationReviewRequestSchema.safeParse(body);
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
      coerceDelimitationReviewDraft(parsed.data.draft)
    );

    const hasSomeContent = Boolean(
      draft.topic ||
        draft.context_place ||
        draft.time_period ||
        draft.population ||
        draft.resources ||
        draft.include.length ||
        draft.exclude.length
    );

    if (!hasSomeContent) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No hay suficiente información para evaluar la delimitación todavía.",
        },
        { status: 400, headers: buildRateLimitHeaders(rate) }
      );
    }

    const guardrailNote = buildReviewGuardrailNote(draft);
    const hasGoogle = Boolean(process.env.GEMINI_API_KEY?.trim());
    const gatewayModels = !process.env.AI_GATEWAY_API_KEY?.trim() ? []
      : hasGoogle ? [resolveGatewayModel()] : resolveGatewayModels();

    logAiEvent("info", "review.request", {
      requestId,
      projectId: pid.data,
      clientIp,
      userAgent,
      rateRemaining: rate.remaining,
      models: [
        ...gatewayModels,
        ...(hasGoogle
          ? [`google-ai-studio/${resolveGoogleAiStudioModelName()}`]
          : []),
      ],
      draftLengths: {
        topic: draft.topic.length,
        context_place: draft.context_place.length,
        time_period: draft.time_period.length,
        population: draft.population.length,
        resources: draft.resources.length,
        include: draft.include.length,
        exclude: draft.exclude.length,
      },
      hasGuardrailNote: Boolean(guardrailNote),
    });

    const prompt = buildDelimitationReviewPrompt(
      { ...parsed.data, draft }, { guardrailNote }
    );
    const result = await runReviewWithFallback({
      gateway: signal => generateStructuredReview({
        models: gatewayModels,
        tokenLimits: hasGoogle
          ? REVIEW_PRIMARY_TOKEN_LIMITS
          : REVIEW_OUTPUT_TOKEN_LIMITS,
        prompt,
        requestId,
        projectId: pid.data,
        signal,
      }),
      google: (model, signal) => generateGoogleAiStudioReview({ model, prompt, signal }),
      heuristic: () => DelimitationReviewOutputSchema.parse(
        buildHeuristicDelimitationReview({ draft, heuristics: parsed.data.heuristics })
      ),
    });
    const safeOutput = applyReviewOutputGuardrails(result.output);

    logAiEvent("info", "review.finish", {
      requestId,
      projectId: pid.data,
      clientIp,
      durationMs: Date.now() - startedAt,
      score: safeOutput.overall.score,
      verdict: safeOutput.overall.verdict,
      findings: safeOutput.findings.length,
      source: result.source,
      model: result.model,
    });

    return NextResponse.json(
      {
        ok: true,
        review: {
          ...safeOutput,
          source: result.source,
          model: result.model,
        },
      },
      {
        headers: buildRateLimitHeaders(rate),
      }
    );
  } catch (e: unknown) {
    logAiEvent("error", "review.route_error", {
      requestId,
      clientIp,
      userAgent,
      durationMs: Date.now() - startedAt,
      error: serializeError(e),
    });

    return NextResponse.json(
      { ok: false, error: reviewErrorMessage(e) },
      { status: reviewErrorStatus(e) }
    );
  }
}
