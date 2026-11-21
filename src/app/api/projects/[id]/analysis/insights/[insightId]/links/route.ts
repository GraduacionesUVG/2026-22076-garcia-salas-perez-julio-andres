import { normalizeDependencyError } from "@/src/modules/security/dependency-errors";
import { NextResponse } from "next/server";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { ProjectIdSchema } from "@/src/modules/projects/projects.schema";
import {
  InsightIdSchema,
  InsightLinkCreateSchema,
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
  if (e?.message === "INVALID_LINK_TARGET") {
    return { status: 400, error: "INVALID_LINK_TARGET" };
  }

  if (e?.code === "23505") {
    return { status: 409, error: "INSIGHT_LINK_ALREADY_EXISTS" };
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
    const links = await service.listLinks({
      projectId: pid.data,
      insightId: parsedInsightId.data,
    });

    if (!links) {
      return notFoundResponse();
    }

    return NextResponse.json({ ok: true, links });
  } catch (e: unknown) {
    e = normalizeDependencyError(e);
    const mapped = mapAnalysisError(e as RouteError);

    return NextResponse.json(
      { ok: false, error: mapped.error },
      { status: mapped.status }
    );
  }
}

export async function POST(
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

    const parsedBody = InsightLinkCreateSchema.safeParse(body);
    if (!parsedBody.success) {
      return validationErrorResponse(parsedBody.error.flatten());
    }

    const service = new AnalysisInsightsService(
      new AnalysisInsightsRepo(supabase)
    );
    const link = await service.createLink({
      projectId: pid.data,
      insightId: parsedInsightId.data,
      input: parsedBody.data,
      actorUserId: user.id,
    });

    if (!link) {
      return notFoundResponse();
    }

    return NextResponse.json({ ok: true, link }, { status: 201 });
  } catch (e: unknown) {
    e = normalizeDependencyError(e);
    const mapped = mapAnalysisError(e as RouteError);

    return NextResponse.json(
      { ok: false, error: mapped.error },
      { status: mapped.status }
    );
  }
}
