import { normalizeDependencyError } from "@/src/modules/security/dependency-errors";
import { NextResponse } from "next/server";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { ResearchDesignRepo } from "@/src/modules/research-design/research-design.repo";
import { ResearchDesignService } from "@/src/modules/research-design/research-design.service";
import {
  ProjectIdSchema,
  ResearchDesignCreateVersionSchema,
} from "@/src/modules/research-design/research-design.schema";

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

    const service = new ResearchDesignService(
      new ResearchDesignRepo(supabase)
    );

    const versions = await service.listVersions(pid.data);

    return NextResponse.json({ ok: true, versions });
  } catch (e: unknown) {
    e = normalizeDependencyError(e);
    const error = e as { message?: string; status?: number };
    return NextResponse.json(
      { ok: false, error: error.message ?? "Unknown error" },
      { status: error.status ?? 500 }
    );
  }
}

export async function POST(
  req: Request,
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

    const { supabase, user } = await requireProjectRole(pid.data, [
      "owner",
      "editor",
    ]);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const parsed = ResearchDesignCreateVersionSchema.safeParse(body);
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

    const version = await service.createVersion(pid.data, parsed.data, {
      actorUserId: user.id,
    });

    return NextResponse.json({ ok: true, version: version.version }, {
      status: version.created ? 201 : 200,
    });
  } catch (e: unknown) {
    e = normalizeDependencyError(e);
    const error = e as { message?: string; status?: number };
    return NextResponse.json(
      { ok: false, error: error.message ?? "Unknown error" },
      { status: error.status ?? 500 }
    );
  }
}
