import { normalizeDependencyError } from "@/src/modules/security/dependency-errors";
import { NextResponse } from "next/server";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import {
  SampleConfigRepo,
  SampleConfigRevisionConflictError,
} from "@/src/modules/sample-config/sample-config.repo";
import { SampleConfigService } from "@/src/modules/sample-config/sample-config.service";
import {
  ProjectIdSchema,
  SampleConfigSaveSchema,
} from "@/src/modules/sample-config/sample-config.schema";

export const dynamic = "force-dynamic";

function getErrorStatus(error: unknown) {
  return typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
    ? error.status
    : 500;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

async function handleUpdate(
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

    const parsed = SampleConfigSaveSchema.safeParse(body);
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

    const data = await service.update(pid.data, parsed.data, {
      actorUserId: user.id,
    });

    return NextResponse.json({ ok: true, data });
  } catch (e: unknown) {
    e = normalizeDependencyError(e);
    if (e instanceof SampleConfigRevisionConflictError) {
      return NextResponse.json(
        {
          ok: false,
          error: e.message,
          code: e.code,
          latest_config: e.latest,
        },
        { status: e.status }
      );
    }

    return NextResponse.json(
      { ok: false, error: getErrorMessage(e) },
      { status: getErrorStatus(e) }
    );
  }
}

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

    const [data, options] = await Promise.all([
      service.getFull(pid.data),
      service.getOptions(),
    ]);

    return NextResponse.json({ ok: true, data: { ...data, options } });
  } catch (e: unknown) {
    e = normalizeDependencyError(e);
    return NextResponse.json(
      { ok: false, error: getErrorMessage(e) },
      { status: getErrorStatus(e) }
    );
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  return handleUpdate(req, ctx);
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  return handleUpdate(req, ctx);
}
