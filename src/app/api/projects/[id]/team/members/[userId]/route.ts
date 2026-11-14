import { normalizeDependencyError } from "@/src/modules/security/dependency-errors";
import { NextResponse } from "next/server";
import { requireProjectMember, requireProjectRole } from "@/src/modules/projects/project.guard";
import { ProjectIdSchema } from "@/src/modules/projects/projects.schema";
import { CollaborationRepo } from "@/src/modules/collaboration/collaboration.repo";
import { CollaborationService } from "@/src/modules/collaboration/collaboration.service";
import { CollaborationMemberUpdateSchema } from "@/src/modules/collaboration/collaboration.schema";

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
  return NextResponse.json(
    { ok: false, error: getErrorMessage(error) },
    { status: getErrorStatus(error) }
  );
}

function invalidIdResponse() {
  return NextResponse.json(
    { ok: false, error: "Invalid id" },
    { status: 400 }
  );
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const { id, userId } = await ctx.params;
    const pid = ProjectIdSchema.safeParse(id);
    const uid = ProjectIdSchema.safeParse(userId);

    if (!pid.success || !uid.success) return invalidIdResponse();

    const { supabase, user } = await requireProjectRole(pid.data, ["owner"]);
    const body = await req.json().catch(() => null);
    const parsed = CollaborationMemberUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Validation error", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const service = new CollaborationService(new CollaborationRepo(supabase));
    const member = await service.updateMemberRole({
      projectId: pid.data,
      targetUserId: uid.data,
      actorUserId: user.id,
      input: parsed.data,
    });

    return NextResponse.json({ ok: true, member });
  } catch (error: unknown) {
    error = normalizeDependencyError(error);
    return errorResponse(error);
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const { id, userId } = await ctx.params;
    const pid = ProjectIdSchema.safeParse(id);
    const uid = ProjectIdSchema.safeParse(userId);

    if (!pid.success || !uid.success) return invalidIdResponse();

    const { supabase, user, member } = await requireProjectMember(pid.data);
    if (uid.data !== user.id && member.role !== "owner") {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }
    const service = new CollaborationService(new CollaborationRepo(supabase));

    await service.removeMember({
      projectId: pid.data,
      targetUserId: uid.data,
      actorUserId: user.id,
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    error = normalizeDependencyError(error);
    return errorResponse(error);
  }
}
