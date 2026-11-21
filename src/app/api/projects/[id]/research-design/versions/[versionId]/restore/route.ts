import { normalizeDependencyError } from "@/src/modules/security/dependency-errors";
import { NextResponse } from "next/server";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { ResearchDesignRepo } from "@/src/modules/research-design/research-design.repo";
import { ResearchDesignService } from "@/src/modules/research-design/research-design.service";
import {
  ProjectIdSchema,
  ResearchDesignRestoreVersionSchema,
  ResearchDesignVersionIdSchema,
} from "@/src/modules/research-design/research-design.schema";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
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

    const parsed = ResearchDesignRestoreVersionSchema.safeParse(body);
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

    const service = new ResearchDesignService(
      new ResearchDesignRepo(supabase)
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
    if (e?.code === "RESEARCH_DESIGN_REVISION_CONFLICT") return NextResponse.json({ ok: false, error: e.message, code: e.code, latest_design: e.latest }, { status: 409 });
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: e?.status ?? 500 }
    );
  }
}
