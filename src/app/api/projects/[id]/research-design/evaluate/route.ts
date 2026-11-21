import { normalizeDependencyError } from "@/src/modules/security/dependency-errors";
import { NextResponse } from "next/server";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { DelimitationRepo } from "@/src/modules/delimitation/delimitation.repo";
import { DelimitationService } from "@/src/modules/delimitation/delimitation.service";
import { ResearchDesignRepo } from "@/src/modules/research-design/research-design.repo";
import { ResearchDesignService } from "@/src/modules/research-design/research-design.service";
import { evaluateResearchDesign } from "@/src/modules/research-design/research-design-heuristics";
import { ProjectIdSchema } from "@/src/modules/research-design/research-design.schema";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
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

    const researchDesignService = new ResearchDesignService(
      new ResearchDesignRepo(supabase)
    );

    const delimitationService = new DelimitationService(
      new DelimitationRepo(supabase)
    );

    const data = await researchDesignService.getFull(pid.data);
    const delimitation = await delimitationService.getFull(pid.data);

    const evaluation = evaluateResearchDesign(
      data.design,
      data.specific_objectives,
      delimitation
    );

    return NextResponse.json({
      ok: true,
      data: {
        design: data.design,
        specific_objectives: data.specific_objectives,
        delimitation,
        evaluation,
      },
    });
  } catch (e: any) {
    e = normalizeDependencyError(e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: e?.status ?? 500 }
    );
  }
}
