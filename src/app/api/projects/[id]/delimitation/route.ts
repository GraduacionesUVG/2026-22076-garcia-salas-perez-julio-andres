import { NextResponse } from "next/server";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import {
  DelimitationRepo,
  DelimitationRevisionConflictError,
} from "@/src/modules/delimitation/delimitation.repo";
import { DelimitationService } from "@/src/modules/delimitation/delimitation.service";
import {
  DelimitationSaveSchema,
  ProjectIdSchema,
} from "@/src/modules/delimitation/delimitation.schema";

export const dynamic = "force-dynamic";

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

    const parsed = DelimitationSaveSchema.safeParse(body);
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

    const service = new DelimitationService(new DelimitationRepo(supabase));
    const delim = await service.update(pid.data, parsed.data, {
      actorUserId: user.id,
    });

    return NextResponse.json({ ok: true, delim });
  } catch (e: any) {
    if (e instanceof DelimitationRevisionConflictError) {
      return NextResponse.json(
        {
          ok: false,
          error: e.message,
          code: e.code,
          latest_delimitation: e.latest,
        },
        { status: e.status }
      );
    }

    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: e?.status ?? 500 }
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

    const service = new DelimitationService(new DelimitationRepo(supabase));
    const data = await service.getFull(pid.data);

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: e?.status ?? 500 }
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