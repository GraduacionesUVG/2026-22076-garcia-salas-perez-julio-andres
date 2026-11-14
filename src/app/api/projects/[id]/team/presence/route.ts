import { normalizeDependencyError } from "@/src/modules/security/dependency-errors";
import { NextResponse } from "next/server";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { ProjectIdSchema } from "@/src/modules/projects/projects.schema";
import { CollaborationRepo } from "@/src/modules/collaboration/collaboration.repo";
import { CollaborationService } from "@/src/modules/collaboration/collaboration.service";
import { CollaborationPresenceTouchSchema } from "@/src/modules/collaboration/collaboration.schema";

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
      "viewer",
    ]);
    const body = await req.json().catch(() => null);
    const parsed = CollaborationPresenceTouchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Validation error", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const service = new CollaborationService(new CollaborationRepo(supabase));
    const result = await service.touchPresence({
      projectId: pid.data,
      userId: user.id,
      input: parsed.data,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error: unknown) {
    error = normalizeDependencyError(error);
    return errorResponse(error);
  }
}
