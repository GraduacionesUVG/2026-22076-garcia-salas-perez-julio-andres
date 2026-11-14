import { NextResponse } from "next/server";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { ProjectIdSchema } from "@/src/modules/projects/projects.schema";
import {
  ParticipantCreateSchema,
  ParticipantListQuerySchema,
} from "@/src/modules/participants/participants.schema";
import { ParticipantsRepo } from "@/src/modules/participants/participants.repo";
import { ParticipantsService } from "@/src/modules/participants/participants.service";

export const dynamic = "force-dynamic";

function validationErrorResponse(details: unknown) {
  return NextResponse.json(
    {
      ok: false,
      error: "Validation error",
      details,
    },
    { status: 400 }
  );
}

function invalidProjectResponse() {
  return NextResponse.json(
    { ok: false, error: "Invalid project id" },
    { status: 400 }
  );
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;

    const pid = ProjectIdSchema.safeParse(id);
    if (!pid.success) {
      return invalidProjectResponse();
    }

    const url = new URL(req.url);
    const rawQuery = Object.fromEntries(url.searchParams.entries());

    const parsedQuery = ParticipantListQuerySchema.safeParse(rawQuery);
    if (!parsedQuery.success) {
      return validationErrorResponse(parsedQuery.error.flatten());
    }

    const { supabase } = await requireProjectRole(pid.data, [
      "owner",
      "editor",
      "viewer",
    ]);

    const service = new ParticipantsService(new ParticipantsRepo(supabase));
    const participants = await service.listByProject(
      pid.data,
      parsedQuery.data
    );

    return NextResponse.json({ ok: true, participants });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: e?.status ?? 500 }
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
      return invalidProjectResponse();
    }

    const { supabase, user } = await requireProjectRole(pid.data, [
      "owner",
      "editor",
    ]);

    let body: unknown;

    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const parsedBody = ParticipantCreateSchema.safeParse(body);
    if (!parsedBody.success) {
      return validationErrorResponse(parsedBody.error.flatten());
    }

    const service = new ParticipantsService(new ParticipantsRepo(supabase));
    const participant = await service.create({
      projectId: pid.data,
      input: parsedBody.data,
      actorUserId: user.id,
    });

    return NextResponse.json({ ok: true, participant }, { status: 201 });
  } catch (e: any) {
    const isDuplicateAlias = e?.code === "23505";

    return NextResponse.json(
      {
        ok: false,
        error: isDuplicateAlias
          ? "PARTICIPANT_ALIAS_ALREADY_EXISTS"
          : e?.message ?? "Server error",
      },
      { status: isDuplicateAlias ? 409 : e?.status ?? 500 }
    );
  }
}