import { NextResponse } from "next/server";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { DelimitationRepo } from "@/src/modules/delimitation/delimitation.repo";
import { DelimitationService } from "@/src/modules/delimitation/delimitation.service";
import { ResearchDesignRepo } from "@/src/modules/research-design/research-design.repo";
import { ResearchDesignService } from "@/src/modules/research-design/research-design.service";
import { ResearchDesignReviewService } from "@/src/modules/research-design/research-design-review.service";
import { ProjectIdSchema } from "@/src/modules/research-design/research-design.schema";
import { ResearchDesignReviewRequestSchema } from "@/src/modules/research-design/research-design-review.schema";
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
    process.env.RESEARCH_DESIGN_REVIEW_RATE_LIMIT ??
      process.env.DELIMITATION_REVIEW_RATE_LIMIT ??
      4
  );
}

function resolveReviewWindowMs() {
  return Number(
    process.env.RESEARCH_DESIGN_REVIEW_RATE_WINDOW_MS ??
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
      namespace: "research-design-review",
      key: `${pid.data}:${clientIp}`,
      limit: resolveReviewRateLimit(),
      windowMs: resolveReviewWindowMs(),
    });

    if (rate.limited) {
      logAiEvent("warn", "research_design.review.rate_limited", {
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
            "Has alcanzado el límite temporal de evaluaciones. Espera un momento antes de volver a revisar el research design.",
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

    const parsed = ResearchDesignReviewRequestSchema.safeParse(body);
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

    const researchDesignService = new ResearchDesignService(
      new ResearchDesignRepo(supabase)
    );

    const delimitationService = new DelimitationService(
      new DelimitationRepo(supabase)
    );

    const researchDesign = await researchDesignService.getFull(pid.data);
    const delimitation = await delimitationService.getFull(pid.data);

    const hasSomeContent = Boolean(
      (researchDesign.design.research_question ?? "").trim() ||
        (researchDesign.design.general_objective ?? "").trim() ||
        researchDesign.specific_objectives.length
    );

    if (!hasSomeContent) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No hay suficiente información para revisar el research design todavía.",
        },
        { status: 400, headers: buildRateLimitHeaders(rate) }
      );
    }

    const reviewService = new ResearchDesignReviewService();

    logAiEvent("info", "research_design.review.request", {
      requestId,
      projectId: pid.data,
      clientIp,
      userAgent,
      rateRemaining: rate.remaining,
      focus: parsed.data.focus ?? "full",
      draftStats: {
        questionLength: (researchDesign.design.research_question ?? "").length,
        generalObjectiveLength:
          (researchDesign.design.general_objective ?? "").length,
        specificObjectivesCount: researchDesign.specific_objectives.length,
        delimitationTopicLength: (delimitation.delim?.topic ?? "").length,
        delimitationPopulationLength:
          (delimitation.delim?.population ?? "").length,
      },
    });

    const result = await reviewService.review(
      {
        research_design: researchDesign,
        delimitation,
      },
      parsed.data.focus ?? "full"
    );

    logAiEvent("info", "research_design.review.finish", {
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
          design: researchDesign.design,
          specific_objectives: researchDesign.specific_objectives,
          delimitation,
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
    logAiEvent("error", "research_design.review.route_error", {
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
