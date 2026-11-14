import { normalizeDependencyError } from "@/src/modules/security/dependency-errors";
import { NextResponse } from "next/server";
import { requireSession } from "@/src/modules/auth/auth.guard";
import { CollaborationInvitationAcceptSchema } from "@/src/modules/collaboration/collaboration.schema";
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

export async function POST(req: Request) {
  try {
    const { supabase, user } = await requireSession();
    const body = await req.json().catch(() => null);
    const parsed = CollaborationInvitationAcceptSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Validation error", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const service = new CollaborationService(new CollaborationRepo(supabase));
    const result = await service.acceptInvitation({
      token: parsed.data.token,
      userId: user.id,
      userEmail: user.email,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error: unknown) {
    error = normalizeDependencyError(error);
    return errorResponse(error);
  }
}
