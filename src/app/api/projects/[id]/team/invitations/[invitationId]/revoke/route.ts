import { normalizeDependencyError } from "@/src/modules/security/dependency-errors";
import { NextResponse } from "next/server";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { ProjectIdSchema } from "@/src/modules/projects/projects.schema";
import { CollaborationRepo } from "@/src/modules/collaboration/collaboration.repo";
import { CollaborationService } from "@/src/modules/collaboration/collaboration.service";

export const dynamic = "force-dynamic";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Server error";
}

function getErrorStatus(error: unknown) {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return 500;
  }

  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : 500;
}

function errorResponse(error: unknown) {
  const status = getErrorStatus(error);
  return NextResponse.json(
    { ok: false, error: status >= 500 && getErrorMessage(error) !== "DEPENDENCY_UNAVAILABLE" ? "Server error" : getErrorMessage(error) },
    { status }
  );
}

function invalidIdResponse() {
  return NextResponse.json(
    { ok: false, error: "Invalid id" },
    { status: 400 }
  );
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string; invitationId: string }> }
) {
  try {
    const { id, invitationId } = await ctx.params;
    const pid = ProjectIdSchema.safeParse(id);
    const iid = ProjectIdSchema.safeParse(invitationId);

    if (!pid.success || !iid.success) return invalidIdResponse();

    const { supabase, user } = await requireProjectRole(pid.data, ["owner"]);
    const service = new CollaborationService(new CollaborationRepo(supabase));
    const invitation = await service.revokeInvitation({
      projectId: pid.data,
      invitationId: iid.data,
      actorUserId: user.id,
    });

    return NextResponse.json({ ok: true, invitation });
  } catch (error: unknown) {
    error = normalizeDependencyError(error);
    return errorResponse(error);
  }
}
