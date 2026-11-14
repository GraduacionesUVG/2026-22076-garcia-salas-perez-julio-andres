import { NextResponse } from "next/server";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { DelimitationRepo } from "@/src/modules/delimitation/delimitation.repo";
import { DelimitationService } from "@/src/modules/delimitation/delimitation.service";
import {
  DelimitationVersionIdSchema,
  ProjectIdSchema,
} from "@/src/modules/delimitation/delimitation.schema";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { id, versionId } = await ctx.params;

    const pid = ProjectIdSchema.safeParse(id);
    if (!pid.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid project id" },
        { status: 400 }
      );
    }

    const vid = DelimitationVersionIdSchema.safeParse(versionId);
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

    const service = new DelimitationService(new DelimitationRepo(supabase));
    const data = await service.getVersion(pid.data, vid.data);

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: e?.status ?? 500 }
    );
  }
}