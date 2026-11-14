import { normalizeDependencyError } from "@/src/modules/security/dependency-errors";
import { NextResponse } from "next/server";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { ResearchDesignRepo } from "@/src/modules/research-design/research-design.repo";
import { ResearchDesignService } from "@/src/modules/research-design/research-design.service";
import {
  ProjectIdSchema,
  ResearchDesignVersionIdSchema,
} from "@/src/modules/research-design/research-design.schema";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { id, versionId } = await ctx.params;

    const pid = ProjectIdSchema.safeParse(id);
    const vid = ResearchDesignVersionIdSchema.safeParse(versionId);

    if (!pid.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid project id" },
        { status: 400 }
      );
    }

    if (!vid.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid version id" },
        { status: 400 }
      );
    }

    const { supabase } = await requireProjectRole(pid.data, [
      "owner",
      "editor",
      "viewer",
    ]);

    const service = new ResearchDesignService(
      new ResearchDesignRepo(supabase)
    );

    const snapshot = await service.getVersion(pid.data, vid.data);

    return NextResponse.json({ ok: true, snapshot });
  } catch (e: any) {
    e = normalizeDependencyError(e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: e?.status ?? 500 }
    );
  }
}
