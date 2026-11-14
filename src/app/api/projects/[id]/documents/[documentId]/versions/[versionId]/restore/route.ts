import { NextResponse } from "next/server";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { ProjectIdSchema } from "@/src/modules/projects/projects.schema";
import { DocumentIdSchema } from "@/src/modules/documents/documents.schema";
import {
  DocumentVersionIdSchema,
  DocumentVersionRestoreSchema,
} from "@/src/modules/documents/document-versions.schema";
import { DocumentVersionsRepo } from "@/src/modules/documents/document-versions.repo";
import { DocumentVersionsService } from "@/src/modules/documents/document-versions.service";

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

function mapServiceError(e: any) {
  if (e?.message === "DOCUMENT_REVISION_CONFLICT") {
    return {
      status: 409,
      error: "DOCUMENT_REVISION_CONFLICT",
    };
  }

  if (e?.message === "DOCUMENT_VERSION_NOT_FOUND") {
    return {
      status: 404,
      error: "DOCUMENT_VERSION_NOT_FOUND",
    };
  }

  return {
    status: e?.status ?? 500,
    error: e?.message ?? "Server error",
  };
}

export async function POST(
  req: Request,
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

    const parsedBody = DocumentVersionRestoreSchema.safeParse(body);
    if (!parsedBody.success) {
      return validationErrorResponse(parsedBody.error.flatten());
    }

    const service = new DocumentVersionsService(
      new DocumentVersionsRepo(supabase)
    );

    const document = await service.restore({
      projectId: pid.data,
      documentId: parsedDocumentId.data,
      versionId: parsedVersionId.data,
      input: parsedBody.data,
      actorUserId: user.id,
    });

    if (!document) {
      return NextResponse.json(
        { ok: false, error: "DOCUMENT_NOT_FOUND" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, document });
  } catch (e: any) {
    const mapped = mapServiceError(e);

    return NextResponse.json(
      { ok: false, error: mapped.error },
      { status: mapped.status }
    );
  }
}