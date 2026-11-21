import { normalizeDependencyError } from "@/src/modules/security/dependency-errors";
import { NextResponse } from "next/server";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { ProjectIdSchema } from "@/src/modules/projects/projects.schema";
import { CollaborationRepo } from "@/src/modules/collaboration/collaboration.repo";
import { CollaborationService } from "@/src/modules/collaboration/collaboration.service";
import { CollaborationInvitationCreateSchema } from "@/src/modules/collaboration/collaboration.schema";

export const dynamic = "force-dynamic";

function invalidProjectResponse() {
  return NextResponse.json(
    { ok: false, error: "Invalid project id" },
    { status: 400 }
  );
}

function validationErrorResponse(details: unknown) {
  return NextResponse.json(
    { ok: false, error: "Validation error", details },
    { status: 400 }
  );
}

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

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const pid = ProjectIdSchema.safeParse(id);

    if (!pid.success) return invalidProjectResponse();

    const { supabase, member } = await requireProjectRole(pid.data, [
      "owner",
      "editor",
      "viewer",
    ]);
    const service = new CollaborationService(new CollaborationRepo(supabase));
    const workspace = await service.getWorkspace(pid.data, {
      includeInvitations: member.role === "owner",
    });

    return NextResponse.json({
      ok: true,
      currentRole: member.role,
      ...workspace,
    });
  } catch (error: unknown) {
    error = normalizeDependencyError(error);
    return errorResponse(error);
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const pid = ProjectIdSchema.safeParse(id);

    if (!pid.success) return invalidProjectResponse();

    const { supabase, user } = await requireProjectRole(pid.data, ["owner"]);
    let body: unknown;

    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const parsed = CollaborationInvitationCreateSchema.safeParse(body);

    if (!parsed.success) {
      return validationErrorResponse(parsed.error.flatten());
    }

    const service = new CollaborationService(new CollaborationRepo(supabase));
    const invitation = await service.inviteMember({
      projectId: pid.data,
      actorUserId: user.id,
      actorEmail: user.email,
      input: parsed.data,
    });

    return NextResponse.json({ ok: true, invitation }, { status: 201 });
  } catch (error: unknown) {
    error = normalizeDependencyError(error);
    return errorResponse(error);
  }
}
