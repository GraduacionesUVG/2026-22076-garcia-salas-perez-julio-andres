import { NextResponse } from "next/server";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { ProjectIdSchema } from "@/src/modules/projects/projects.schema";
import { AnalysisOverviewRepo } from "@/src/modules/analysis/analysis-overview.repo";
import {
  AnalysisOverviewService,
  CodingSegmentsQuerySchema,
} from "@/src/modules/analysis/analysis-overview.service";

export const dynamic = "force-dynamic";

function validationErrorResponse(details: unknown) {
  return NextResponse.json(
    { ok: false, error: "VALIDATION_ERROR", details },
    { status: 400 }
  );
}

type RouteError = { message?: string; status?: number };

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const projectId = ProjectIdSchema.safeParse(id);

    if (!projectId.success) {
      return NextResponse.json(
        { ok: false, error: "INVALID_PROJECT_ID" },
        { status: 400 }
      );
    }

    const url = new URL(req.url);
    const query = CodingSegmentsQuerySchema.safeParse(
      Object.fromEntries(url.searchParams.entries())
    );

    if (!query.success) {
      return validationErrorResponse(query.error.flatten());
    }

    const { supabase } = await requireProjectRole(projectId.data, [
      "owner",
      "editor",
      "viewer",
    ]);
    const service = new AnalysisOverviewService(
      new AnalysisOverviewRepo(supabase)
    );
    const result = await service.getCodingSegments(projectId.data, query.data);

    return NextResponse.json({ ok: true, ...result });
  } catch (error: unknown) {
    const routeError = error as RouteError;

    return NextResponse.json(
      { ok: false, error: routeError?.message ?? "Server error" },
      { status: routeError?.status ?? 500 }
    );
  }
}
