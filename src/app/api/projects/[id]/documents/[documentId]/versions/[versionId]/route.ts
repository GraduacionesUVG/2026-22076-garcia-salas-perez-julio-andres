import { NextResponse } from "next/server";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { ProjectIdSchema } from "@/src/modules/projects/projects.schema";
import { DocumentIdSchema } from "@/src/modules/documents/documents.schema";
import { DocumentVersionIdSchema } from "@/src/modules/documents/document-versions.schema";
import { DocumentVersionsRepo } from "@/src/modules/documents/document-versions.repo";
import { DocumentVersionsService } from "@/src/modules/documents/document-versions.service";

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

function invalidVersionResponse() {
  return NextResponse.json(
    { ok: false, error: "Invalid version id" },
    { status: 400 }
  );
}

function notFoundResponse() {
  return NextResponse.json(
    { ok: false, error: "DOCUMENT_VERSION_NOT_FOUND" },
    { status: 404 }
  );
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; documentId: string; versionId: string }> }
) {
  try {
    const { id, documentId, versionId } = await ctx.params;

    const pid = ProjectIdSchema.safeParse(id);
    if (!pid.success) {
      return invalidProjectResponse();
    }

    const parsedDocumentId = DocumentIdSchema.safeParse(documentId);
    if (!parsedDocumentId.success) {
      return invalidDocumentResponse();
    }

    const parsedVersionId = DocumentVersionIdSchema.safeParse(versionId);
    if (!parsedVersionId.success) {
      return invalidVersionResponse();
    }

    const { supabase } = await requireProjectRole(pid.data, [
      "owner",
      "editor",
      "viewer",
    ]);

    const service = new DocumentVersionsService(
      new DocumentVersionsRepo(supabase)
    );

    const version = await service.getById({
      projectId: pid.data,
      documentId: parsedDocumentId.data,
      versionId: parsedVersionId.data,
    });

    if (!version) {
      return notFoundResponse();
    }

    return NextResponse.json({ ok: true, version });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: e?.status ?? 500 }
    );
  }
}