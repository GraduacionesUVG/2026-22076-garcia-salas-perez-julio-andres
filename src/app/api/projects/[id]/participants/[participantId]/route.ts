import { NextResponse } from "next/server";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { ProjectIdSchema } from "@/src/modules/projects/projects.schema";
import {
  ParticipantIdSchema,
  ParticipantUpdateSchema,
} from "@/src/modules/participants/participants.schema";
import { ParticipantsRepo } from "@/src/modules/participants/participants.repo";
import { ParticipantRevisionConflict, ParticipantsService } from "@/src/modules/participants/participants.service";

export const dynamic = "force-dynamic";

function errorDetails(error: unknown): { message?: string; status?: number; code?: string } {
  return typeof error === "object" && error !== null ? error : {};
}

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

function invalidParticipantResponse() {
  return NextResponse.json(
    { ok: false, error: "Invalid participant id" },
    { status: 400 }
  );
}

function notFoundResponse() {
  return NextResponse.json(
    { ok: false, error: "PARTICIPANT_NOT_FOUND" },
    { status: 404 }
  );
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; participantId: string }> }
) {
  try {
    const { id, participantId } = await ctx.params;

    const pid = ProjectIdSchema.safeParse(id);
    if (!pid.success) {
      return invalidProjectResponse();
    }

    const parsedParticipantId = ParticipantIdSchema.safeParse(participantId);
    if (!parsedParticipantId.success) {
      return invalidParticipantResponse();
    }

    const { supabase } = await requireProjectRole(pid.data, [
      "owner",
      "editor",
      "viewer",
    ]);

    const service = new ParticipantsService(new ParticipantsRepo(supabase));
    const participant = await service.getById({
      projectId: pid.data,
      participantId: parsedParticipantId.data,
    });

    if (!participant) {
      return notFoundResponse();
    }

    return NextResponse.json({ ok: true, participant });
  } catch (error: unknown) {
    const e = errorDetails(error);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: e?.status ?? 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; participantId: string }> }
) {
  try {
    const { id, participantId } = await ctx.params;

    const pid = ProjectIdSchema.safeParse(id);
    if (!pid.success) {
      return invalidProjectResponse();
    }

    const parsedParticipantId = ParticipantIdSchema.safeParse(participantId);
    if (!parsedParticipantId.success) {
      return invalidParticipantResponse();
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

    const parsedBody = ParticipantUpdateSchema.safeParse(body);
    if (!parsedBody.success) {
      return validationErrorResponse(parsedBody.error.flatten());
    }

    const service = new ParticipantsService(new ParticipantsRepo(supabase));
    const participant = await service.update({
      projectId: pid.data,
      participantId: parsedParticipantId.data,
      input: parsedBody.data,
      actorUserId: user.id,
    });

    if (!participant) {
      return notFoundResponse();
    }

    return NextResponse.json({ ok: true, participant });
  } catch (error: unknown) {
    const e = errorDetails(error);
    const isDuplicateAlias = e?.code === "23505";

    if (error instanceof ParticipantRevisionConflict) {
      return NextResponse.json(
        { ok: false, error: error.message, latest_participant: error.latestParticipant },
        { status: 409 }
      );
    }

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

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; participantId: string }> }
) {
  try {
    const { id, participantId } = await ctx.params;

    const pid = ProjectIdSchema.safeParse(id);
    if (!pid.success) {
      return invalidProjectResponse();
    }

    const parsedParticipantId = ParticipantIdSchema.safeParse(participantId);
    if (!parsedParticipantId.success) {
      return invalidParticipantResponse();
    }

    const { supabase, user } = await requireProjectRole(pid.data, [
      "owner",
      "editor",
    ]);

    const service = new ParticipantsService(new ParticipantsRepo(supabase));
    const participant = await service.softDelete({
      projectId: pid.data,
      participantId: parsedParticipantId.data,
      actorUserId: user.id,
    });

    if (!participant) {
      return notFoundResponse();
    }

    return NextResponse.json({ ok: true, participant });
  } catch (error: unknown) {
    const e = errorDetails(error);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: e?.status ?? 500 }
    );
  }
}
