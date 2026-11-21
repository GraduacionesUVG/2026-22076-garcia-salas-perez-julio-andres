import { normalizeDependencyError } from "@/src/modules/security/dependency-errors";
import { NextResponse } from "next/server";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { SampleConfigRepo } from "@/src/modules/sample-config/sample-config.repo";
import { SampleConfigService } from "@/src/modules/sample-config/sample-config.service";
import {
  ProjectIdSchema,
  SampleConfigRestoreVersionSchema,
  SampleConfigVersionIdSchema,
} from "@/src/modules/sample-config/sample-config.schema";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { id, versionId } = await ctx.params;

    const pid = ProjectIdSchema.safeParse(id);
    const vid = SampleConfigVersionIdSchema.safeParse(versionId);

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

    const { supabase, user } = await requireProjectRole(pid.data, [
      "owner",
      "editor",
    ]);

    let body: unknown;
    try {
      const text = await req.text();
      body = text === "" ? {} : JSON.parse(text);
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = SampleConfigRestoreVersionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Validation error",
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const service = new SampleConfigService(
      new SampleConfigRepo(supabase)
    );

    const restored = await service.restoreVersion(
      pid.data,
      vid.data,
      parsed.data,
      {
        actorUserId: user.id,
      }
    );

    return NextResponse.json({ ok: true, restored });
  } catch (error: unknown) {
    const e = normalizeDependencyError(error) as { message?: string; status?: number; code?: string; latest?: unknown };
    if (e?.code === "SAMPLE_CONFIG_REVISION_CONFLICT") return NextResponse.json({ ok: false, error: e.message, code: e.code, latest_config: e.latest }, { status: 409 });
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: e?.status ?? 500 }
    );
  }
}
