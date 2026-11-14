import { normalizeDependencyError } from "@/src/modules/security/dependency-errors";
import { NextResponse } from "next/server";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { ProjectIdSchema } from "@/src/modules/projects/projects.schema";
import { DocumentIdSchema } from "@/src/modules/documents/documents.schema";
import { DocumentsRepo } from "@/src/modules/documents/documents.repo";
import { DocumentsService } from "@/src/modules/documents/documents.service";

export const dynamic = "force-dynamic";

function invalidProjectResponse() {
  return NextResponse.json(
    { ok: false, error: "Invalid project id" },
    { status: 400 }
  );
}

function invalidDocumentResponse() {
  return NextResponse.json(
    { ok: false, error: "Invalid document id" },
    { status: 400 }
  );
}

function notFoundResponse() {
  return NextResponse.json(
    { ok: false, error: "DOCUMENT_NOT_FOUND_OR_NOT_DELETED" },
    { status: 404 }
  );
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string; documentId: string }> }
) {
  try {
    const { id, documentId } = await ctx.params;

    const pid = ProjectIdSchema.safeParse(id);
    if (!pid.success) {
      return invalidProjectResponse();
    }

    const parsedDocumentId = DocumentIdSchema.safeParse(documentId);
    if (!parsedDocumentId.success) {
      return invalidDocumentResponse();
    }

    const { supabase, user } = await requireProjectRole(pid.data, [
      "owner",
      "editor",
    ]);

    const service = new DocumentsService(new DocumentsRepo(supabase));

    const document = await service.restore({
      projectId: pid.data,
      documentId: parsedDocumentId.data,
      actorUserId: user.id,
    });

    if (!document) {
      return notFoundResponse();
    }

    return NextResponse.json({ ok: true, document });
  } catch (e: any) {
    e = normalizeDependencyError(e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: e?.status ?? 500 }
    );
  }
}
