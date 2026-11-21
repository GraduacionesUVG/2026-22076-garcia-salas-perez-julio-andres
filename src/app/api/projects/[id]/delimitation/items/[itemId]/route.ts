import { NextResponse } from "next/server";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { DelimitationRepo } from "@/src/modules/delimitation/delimitation.repo";
import { DelimitationService } from "@/src/modules/delimitation/delimitation.service";
import {
  DelimitationItemIdSchema,
  DelimitationItemUpdateSchema,
  ProjectIdSchema,
} from "@/src/modules/delimitation/delimitation.schema";

export const dynamic = "force-dynamic";

function notFoundResponse(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 404 });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id, itemId } = await ctx.params;

    const pid = ProjectIdSchema.safeParse(id);
    if (!pid.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid project id" },
        { status: 400 }
      );
    }

    const iid = DelimitationItemIdSchema.safeParse(itemId);
    if (!iid.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid item id" },
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

    const parsed = DelimitationItemUpdateSchema.safeParse(body);
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
    const item = await service.updateItem(pid.data, iid.data, parsed.data, {
      actorUserId: user.id,
    });

    if (!item) {
      return notFoundResponse("ITEM_NOT_FOUND");
    }

    return NextResponse.json({ ok: true, item });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: e?.status ?? 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id, itemId } = await ctx.params;

    const pid = ProjectIdSchema.safeParse(id);
    if (!pid.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid project id" },
        { status: 400 }
      );
    }

    const iid = DelimitationItemIdSchema.safeParse(itemId);
    if (!iid.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid item id" },
        { status: 400 }
      );
    }

    const { supabase, user } = await requireProjectRole(pid.data, [
      "owner",
      "editor",
    ]);

    const service = new DelimitationService(new DelimitationRepo(supabase));
    const result = await service.removeItemWithCount(pid.data, iid.data, {
      actorUserId: user.id,
    });

    if (result.deletedCount === 0) {
      return notFoundResponse("ITEM_NOT_FOUND");
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: e?.status ?? 500 }
    );
  }
}