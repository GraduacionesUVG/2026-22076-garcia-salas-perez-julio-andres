import { NextResponse } from "next/server";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { DelimitationRepo } from "@/src/modules/delimitation/delimitation.repo";
import { DelimitationService } from "@/src/modules/delimitation/delimitation.service";
import {
  DelimitationVersionCreateSchema,
  ProjectIdSchema,
} from "@/src/modules/delimitation/delimitation.schema";

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

    const service = new DelimitationService(new DelimitationRepo(supabase));
    const versions = await service.listVersions(pid.data);

    return NextResponse.json({ ok: true, versions });
  } catch (e: unknown) {
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

    const parsed = DelimitationVersionCreateSchema.safeParse(body);
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
    const result = await service.saveVersion(pid.data, user.id, parsed.data.label, {
      triggerType: "manual",
    });

    // Keep the canonical `version` field at the top level for the workflow
    // contract while retaining `data` for the existing frontend client.
    return NextResponse.json(
      {
        ok: true,
        version: result.version,
        created: result.created,
        reason: result.reason,
        data: result,
      },
      { status: result.created ? 201 : 200 }
    );
  } catch (e: unknown) {
    const error = e as { message?: string; status?: number };
    return NextResponse.json(
      { ok: false, error: error.message ?? "Unknown error" },
      { status: error.status ?? 500 }
    );
  }
}
