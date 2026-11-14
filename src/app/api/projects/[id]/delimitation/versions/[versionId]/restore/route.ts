import { NextResponse } from "next/server";
import { normalizeDependencyError } from "@/src/modules/security/dependency-errors";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { DelimitationRepo } from "@/src/modules/delimitation/delimitation.repo";
import { DelimitationService } from "@/src/modules/delimitation/delimitation.service";
import {
  DelimitationVersionIdSchema,
  DelimitationRestoreVersionSchema,
  ProjectIdSchema,
} from "@/src/modules/delimitation/delimitation.schema";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
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

    const { supabase, user } = await requireProjectRole(pid.data, [
      "owner",
      "editor",
    ]);

    const service = new DelimitationService(new DelimitationRepo(supabase));
    let body: unknown;
    try {
      const text = await req.text();
      body = text === "" ? {} : JSON.parse(text);
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = DelimitationRestoreVersionSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ ok: false, error: "Validation error", details: parsed.error.flatten() }, { status: 400 });
    const data = await service.restoreVersion(pid.data, vid.data, user.id, parsed.data);

    return NextResponse.json({ ok: true, data });
  } catch (error: unknown) {
    const e = normalizeDependencyError(error) as { message?: string; status?: number; code?: string; latest?: unknown };
    if (e?.code === "DELIMITATION_REVISION_CONFLICT") return NextResponse.json({ ok: false, error: e.message, code: e.code, latest_delimitation: e.latest }, { status: 409 });
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: e?.status ?? 500 }
    );
  }
}
