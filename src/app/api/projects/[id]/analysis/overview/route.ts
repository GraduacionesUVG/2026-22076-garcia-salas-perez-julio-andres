import { NextResponse } from "next/server";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { ProjectIdSchema } from "@/src/modules/projects/projects.schema";
import { AnalysisOverviewRepo } from "@/src/modules/analysis/analysis-overview.repo";
import { AnalysisOverviewService } from "@/src/modules/analysis/analysis-overview.service";

export const dynamic = "force-dynamic";

function invalidProjectResponse() {
  return NextResponse.json(
    { ok: false, error: "INVALID_PROJECT_ID" },
    { status: 400 }
  );
}

type RouteError = { message?: string; status?: number; code?: string };

function mapAnalysisError(e: RouteError) {
  return { status: e?.status ?? 500, error: e?.message ?? "Server error" };
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;

    const pid = ProjectIdSchema.safeParse(id);
    if (!pid.success) {
      return invalidProjectResponse();
    }

    const { supabase } = await requireProjectRole(pid.data, [
      "owner",
      "editor",
      "viewer",
    ]);

    const service = new AnalysisOverviewService(
      new AnalysisOverviewRepo(supabase)
    );
    const overview = await service.getOverview(pid.data);

    return NextResponse.json({ ok: true, overview });
  } catch (e: unknown) {
    const mapped = mapAnalysisError(e as RouteError);

    return NextResponse.json(
      { ok: false, error: mapped.error },
      { status: mapped.status }
    );
  }
}
