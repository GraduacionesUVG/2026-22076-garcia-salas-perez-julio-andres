import { normalizeDependencyError } from "@/src/modules/security/dependency-errors";
import { NextResponse } from "next/server";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { ProjectIdSchema } from "@/src/modules/projects/projects.schema";
import {
  DocumentIdSchema,
  DocumentUpdateSchema,
} from "@/src/modules/documents/documents.schema";
import { DocumentsRepo } from "@/src/modules/documents/documents.repo";
import { DocumentsService } from "@/src/modules/documents/documents.service";

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

function notFoundResponse() {
  return NextResponse.json(
    { ok: false, error: "DOCUMENT_NOT_FOUND" },
    { status: 404 }
  );
}

function mapDatabaseError(e: any) {
  if (e?.message === "DOCUMENT_REVISION_CONFLICT") {
    return {
      status: 409,
      error: "DOCUMENT_REVISION_CONFLICT",
    };
  }

  if (e?.message === "DOCUMENT_HAS_ACTIVE_SEGMENTS") {
    return { status: 409, error: "DOCUMENT_HAS_ACTIVE_SEGMENTS" };
  }

  if (e?.message?.includes("Invalid document source for this project")) {
    return {
      status: 400,
      error: "INVALID_DOCUMENT_SOURCE_FOR_PROJECT",
    };
  }

  if (e?.message?.includes("Invalid participant for this project")) {
    return {
      status: 400,
      error: "INVALID_PARTICIPANT_FOR_PROJECT",
    };
  }

  return {
    status: e?.status ?? 500,
    error: e?.message ?? "Server error",
  };
}

export async function GET(
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

    const { supabase } = await requireProjectRole(pid.data, [
      "owner",
      "editor",
      "viewer",
    ]);

    const service = new DocumentsService(new DocumentsRepo(supabase));

    const document = await service.getById({
      projectId: pid.data,
      documentId: parsedDocumentId.data,
    });

    if (!document) {
      return notFoundResponse();
    }

    return NextResponse.json({ ok: true, document });
  } catch (e: any) {
    e = normalizeDependencyError(e);
    const mapped = mapDatabaseError(e);

    return NextResponse.json(
      { ok: false, error: mapped.error },
      { status: mapped.status }
    );
  }
}

export async function PATCH(
  req: Request,
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

    let body: unknown;

    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const parsedBody = DocumentUpdateSchema.safeParse(body);
    if (!parsedBody.success) {
      return validationErrorResponse(parsedBody.error.flatten());
    }

    const service = new DocumentsService(new DocumentsRepo(supabase));

    const document = await service.update({
      projectId: pid.data,
      documentId: parsedDocumentId.data,
      input: parsedBody.data,
      actorUserId: user.id,
    });

    if (!document) {
      return notFoundResponse();
    }

    return NextResponse.json({ ok: true, document });
  } catch (e: any) {
    e = normalizeDependencyError(e);
    const mapped = mapDatabaseError(e);

    return NextResponse.json(
      { ok: false, error: mapped.error },
      { status: mapped.status }
    );
  }
}

export async function DELETE(
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

    const document = await service.softDelete({
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
    const mapped = mapDatabaseError(e);

    return NextResponse.json(
      { ok: false, error: mapped.error },
      { status: mapped.status }
    );
  }
}
