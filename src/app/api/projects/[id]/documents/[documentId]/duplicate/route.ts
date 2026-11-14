import { normalizeDependencyError } from "@/src/modules/security/dependency-errors";
import { NextResponse } from "next/server";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { ProjectIdSchema } from "@/src/modules/projects/projects.schema";
import { DocumentIdSchema } from "@/src/modules/documents/documents.schema";
import { DocumentsRepo } from "@/src/modules/documents/documents.repo";
import { DocumentsService } from "@/src/modules/documents/documents.service";

export const dynamic = "force-dynamic";

function invalidResponse(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string; documentId: string }> }
) {
  try {
    const { id, documentId } = await ctx.params;
    const pid = ProjectIdSchema.safeParse(id);
    const did = DocumentIdSchema.safeParse(documentId);

    if (!pid.success) return invalidResponse("INVALID_PROJECT_ID");
    if (!did.success) return invalidResponse("INVALID_DOCUMENT_ID");

    const { supabase, user } = await requireProjectRole(pid.data, [
      "owner",
      "editor",
    ]);
    const service = new DocumentsService(new DocumentsRepo(supabase));
    const document = await service.duplicate({
      projectId: pid.data,
      documentId: did.data,
      actorUserId: user.id,
    });

    if (!document) {
      return NextResponse.json(
        { ok: false, error: "DOCUMENT_NOT_FOUND" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, document }, { status: 201 });
  } catch (error: unknown) {
    error = normalizeDependencyError(error);
    const routeError = error as { message?: string; status?: number };

    return NextResponse.json(
      { ok: false, error: routeError?.message ?? "Server error" },
      { status: routeError?.status ?? 500 }
    );
  }
}
