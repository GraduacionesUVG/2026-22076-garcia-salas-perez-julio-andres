import { normalizeDependencyError } from "@/src/modules/security/dependency-errors";
import { NextResponse } from "next/server";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { ProjectIdSchema } from "@/src/modules/projects/projects.schema";
import {
  InsightIdSchema,
  InsightUpdateSchema,
} from "@/src/modules/analysis/analysis-insights.schema";
import { AnalysisInsightsRepo } from "@/src/modules/analysis/analysis-insights.repo";
import { AnalysisInsightsService } from "@/src/modules/analysis/analysis-insights.service";

export const dynamic = "force-dynamic";

function validationErrorResponse(details: unknown) {
  return NextResponse.json(
    { ok: false, error: "VALIDATION_ERROR", details },
    { status: 400 }
  );
}

function invalidProjectResponse() {
  return NextResponse.json(
    { ok: false, error: "INVALID_PROJECT_ID" },
    { status: 400 }
  );
}

function invalidInsightResponse() {
  return NextResponse.json(
    { ok: false, error: "Invalid insight id" },
    { status: 400 }
  );
}

function notFoundResponse() {
  return NextResponse.json(
    { ok: false, error: "INSIGHT_NOT_FOUND" },
    { status: 404 }
  );
}

type RouteError = { message?: string; status?: number; code?: string };

function mapAnalysisError(e: RouteError) {
  if (e?.message === "INSIGHT_REVISION_CONFLICT") {
    return { status: 409, error: "INSIGHT_REVISION_CONFLICT" };
  }

  return { status: e?.status ?? 500, error: e?.message ?? "Server error" };
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; insightId: string }> }
) {
  try {
    const { id, insightId } = await ctx.params;

    const pid = ProjectIdSchema.safeParse(id);
    if (!pid.success) {
      return invalidProjectResponse();
    }

    const parsedInsightId = InsightIdSchema.safeParse(insightId);
    if (!parsedInsightId.success) {
      return invalidInsightResponse();
    }

    const { supabase } = await requireProjectRole(pid.data, [
      "owner",
      "editor",
      "viewer",
    ]);

    const service = new AnalysisInsightsService(
      new AnalysisInsightsRepo(supabase)
    );
    const insight = await service.getById({
      projectId: pid.data,
      insightId: parsedInsightId.data,
    });

    if (!insight) {
      return notFoundResponse();
    }

    return NextResponse.json({ ok: true, insight });
  } catch (e: unknown) {
    e = normalizeDependencyError(e);
    const mapped = mapAnalysisError(e as RouteError);

    return NextResponse.json(
      { ok: false, error: mapped.error },
      { status: mapped.status }
    );
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; insightId: string }> }
) {
  try {
    const { id, insightId } = await ctx.params;

    const pid = ProjectIdSchema.safeParse(id);
    if (!pid.success) {
      return invalidProjectResponse();
    }

    const parsedInsightId = InsightIdSchema.safeParse(insightId);
    if (!parsedInsightId.success) {
      return invalidInsightResponse();
    }

    const { supabase, user } = await requireProjectRole(pid.data, [
      "owner",
      "editor",
    ]);

    let body: unknown;

    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const parsedBody = InsightUpdateSchema.safeParse(body);
    if (!parsedBody.success) {
      return validationErrorResponse(parsedBody.error.flatten());
    }

    const service = new AnalysisInsightsService(
      new AnalysisInsightsRepo(supabase)
    );
    const insight = await service.update({
      projectId: pid.data,
      insightId: parsedInsightId.data,
      input: parsedBody.data,
      actorUserId: user.id,
    });

    if (!insight) {
      return notFoundResponse();
    }

    return NextResponse.json({ ok: true, insight });
  } catch (e: unknown) {
    e = normalizeDependencyError(e);
    const mapped = mapAnalysisError(e as RouteError);

    return NextResponse.json(
      { ok: false, error: mapped.error },
      { status: mapped.status }
    );
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; insightId: string }> }
) {
  try {
    const { id, insightId } = await ctx.params;

    const pid = ProjectIdSchema.safeParse(id);
    if (!pid.success) {
      return invalidProjectResponse();
    }

    const parsedInsightId = InsightIdSchema.safeParse(insightId);
    if (!parsedInsightId.success) {
      return invalidInsightResponse();
    }

    const { supabase, user } = await requireProjectRole(pid.data, [
      "owner",
      "editor",
    ]);

    const service = new AnalysisInsightsService(
      new AnalysisInsightsRepo(supabase)
    );
    const insight = await service.softDelete({
      projectId: pid.data,
      insightId: parsedInsightId.data,
      actorUserId: user.id,
    });

    if (!insight) {
      return notFoundResponse();
    }

    return NextResponse.json({ ok: true, insight });
  } catch (e: unknown) {
    e = normalizeDependencyError(e);
    const mapped = mapAnalysisError(e as RouteError);

    return NextResponse.json(
      { ok: false, error: mapped.error },
      { status: mapped.status }
    );
  }
}
