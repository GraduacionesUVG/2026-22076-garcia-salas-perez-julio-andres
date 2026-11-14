import { normalizeDependencyError } from "@/src/modules/security/dependency-errors";
import { NextResponse } from "next/server";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { SampleConfigRepo } from "@/src/modules/sample-config/sample-config.repo";
import { SampleConfigService } from "@/src/modules/sample-config/sample-config.service";
import { ProjectIdSchema } from "@/src/modules/sample-config/sample-config.schema";

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

    const service = new SampleConfigService(
      new SampleConfigRepo(supabase)
    );

    const options = await service.getOptions();

    return NextResponse.json({ ok: true, options });
  } catch (e: any) {
    e = normalizeDependencyError(e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: e?.status ?? 500 }
    );
  }
}
