import { NextResponse } from "next/server";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { SampleConfigRepo } from "@/src/modules/sample-config/sample-config.repo";
import { SampleConfigService } from "@/src/modules/sample-config/sample-config.service";
import { SampleConfigReviewService } from "@/src/modules/sample-config/sample-config-review.service";
import {
  ProjectIdSchema,
} from "@/src/modules/sample-config/sample-config.schema";
import { SampleConfigReviewRequestSchema } from "@/src/modules/sample-config/sample-config-review.schema";
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

function resolveReviewRateLimit() {
  return Number(
    process.env.SAMPLE_CONFIG_REVIEW_RATE_LIMIT ??
      process.env.DELIMITATION_REVIEW_RATE_LIMIT ??
      4
  );
}

function resolveReviewWindowMs() {
  return Number(
    process.env.SAMPLE_CONFIG_REVIEW_RATE_WINDOW_MS ??
      process.env.DELIMITATION_REVIEW_RATE_WINDOW_MS ??
      300_000
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

    const { supabase } = await requireProjectRole(pid.data, [
      "owner",
      "editor",
      "viewer",
    ]);

    const rate = checkMemoryRateLimit({
      namespace: "sample-config-review",
      key: `${pid.data}:${clientIp}`,
      limit: resolveReviewRateLimit(),
      windowMs: resolveReviewWindowMs(),
    });

    if (rate.limited) {
      logAiEvent("warn", "sample_config.review.rate_limited", {
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
            "Has alcanzado el límite temporal de revisiones. Espera un momento antes de volver a revisar la muestra.",
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

    const parsed = SampleConfigReviewRequestSchema.safeParse(body);
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

    const sampleConfigService = new SampleConfigService(
      new SampleConfigRepo(supabase)
    );

    const sampleConfig = await sampleConfigService.getFull(pid.data);
    const options = await sampleConfigService.getOptions();

    const hasSomeContent = Boolean(
      sampleConfig.config.main_approach_code ||
        sampleConfig.config.scope_code ||
        (sampleConfig.config.field_phase ?? "").trim() ||
        sampleConfig.config.target_sample_size !== null ||
        (sampleConfig.config.sample_size_rationale ?? "").trim() ||
        sampleConfig.collection_techniques.length
    );

    if (!hasSomeContent) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No hay suficiente información para revisar la configuración de muestra todavía.",
        },
        { status: 400, headers: buildRateLimitHeaders(rate) }
      );
    }

    const reviewService = new SampleConfigReviewService();

    logAiEvent("info", "sample_config.review.request", {
      requestId,
      projectId: pid.data,
      clientIp,
      userAgent,
      rateRemaining: rate.remaining,
      focus: parsed.data.focus ?? "full",
      draftStats: {
        mainApproachCode: sampleConfig.config.main_approach_code ?? null,
        scopeCode: sampleConfig.config.scope_code ?? null,
        fieldPhaseLength: (sampleConfig.config.field_phase ?? "").length,
        targetSampleSize: sampleConfig.config.target_sample_size ?? null,
        sampleSizeRationaleLength:
          (sampleConfig.config.sample_size_rationale ?? "").length,
        collectionTechniquesCount: sampleConfig.collection_techniques.length,
      },
    });

    const result = await reviewService.review(
      {
        sample_config: sampleConfig,
        options,
      },
      parsed.data.focus ?? "full"
    );

    logAiEvent("info", "sample_config.review.finish", {
      requestId,
      projectId: pid.data,
      clientIp,
      durationMs: Date.now() - startedAt,
      model: result.model,
      source: result.source,
      overallStatus: result.ai_review.overall_status,
      issues: result.ai_review.issues.length,
      guidingQuestions: result.ai_review.guiding_questions.length,
    });

    return NextResponse.json(
      {
        ok: true,
        data: {
          sample_config: sampleConfig,
          evaluation: result.evaluation,
          ai_review: result.ai_review,
          meta: {
            model: result.model,
            source: result.source,
          },
        },
      },
      {
        headers: buildRateLimitHeaders(rate),
      }
    );
  } catch (e: any) {
    logAiEvent("error", "sample_config.review.route_error", {
      requestId,
      clientIp,
      userAgent,
      durationMs: Date.now() - startedAt,
      error: serializeError(e),
    });

    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: e?.status ?? 500 }
    );
  }
}
