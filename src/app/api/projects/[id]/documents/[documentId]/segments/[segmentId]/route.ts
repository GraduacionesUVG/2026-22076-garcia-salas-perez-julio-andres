import { normalizeDependencyError } from "@/src/modules/security/dependency-errors";
import { NextResponse } from "next/server";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { ProjectIdSchema } from "@/src/modules/projects/projects.schema";
import { DocumentIdSchema } from "@/src/modules/documents/documents.schema";
import {
  DocumentSegmentIdSchema,
  DocumentSegmentUpdateSchema,
} from "@/src/modules/documents/document-segments.schema";
import { DocumentSegmentsRepo } from "@/src/modules/documents/document-segments.repo";
import { DocumentSegmentsService } from "@/src/modules/documents/document-segments.service";

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

function invalidSegmentResponse() {
  return NextResponse.json(
    { ok: false, error: "Invalid segment id" },
    { status: 400 }
  );
}

function notFoundResponse() {
  return NextResponse.json(
    { ok: false, error: "SEGMENT_NOT_FOUND" },
    { status: 404 }
  );
}

function mapSegmentError(e: any) {
  const message = e?.message ?? "";

  if (message === "DOCUMENT_REVISION_CONFLICT") {
    return { status: 409, error: "DOCUMENT_REVISION_CONFLICT" };
  }

  if (message === "SEGMENT_REVISION_CONFLICT") {
    return { status: 409, error: "SEGMENT_REVISION_CONFLICT" };
  }

  if (message === "SEGMENT_RANGE_OUTSIDE_DOCUMENT") {
    return { status: 400, error: "SEGMENT_RANGE_OUTSIDE_DOCUMENT" };
  }

  if (message === "INVALID_SEGMENT_RANGE") {
    return { status: 400, error: "INVALID_SEGMENT_RANGE" };
  }

  if (message === "SELECTED_TEXT_DOES_NOT_MATCH_DOCUMENT") {
    return { status: 400, error: "SELECTED_TEXT_DOES_NOT_MATCH_DOCUMENT" };
  }

  if (message.includes("Segment range is outside document content")) {
    return { status: 400, error: "SEGMENT_RANGE_OUTSIDE_DOCUMENT" };
  }

  if (message.includes("Selected text does not match document content range")) {
    return { status: 400, error: "SELECTED_TEXT_DOES_NOT_MATCH_DOCUMENT" };
  }

  if (message.includes("Document does not exist or is deleted")) {
    return { status: 404, error: "DOCUMENT_NOT_FOUND" };
  }

  if (e?.code === "23505") {
    return { status: 409, error: "SEGMENT_ALREADY_EXISTS" };
  }

  return {
    status: e?.status ?? 500,
    error: e?.message ?? "Server error",
  };
}

export async function GET(
  _req: Request,
  ctx: {
    params: Promise<{ id: string; documentId: string; segmentId: string }>;
  }
) {
  try {
    const { id, documentId, segmentId } = await ctx.params;

    const pid = ProjectIdSchema.safeParse(id);
    if (!pid.success) {
      return invalidProjectResponse();
    }

    const parsedDocumentId = DocumentIdSchema.safeParse(documentId);
    if (!parsedDocumentId.success) {
      return invalidDocumentResponse();
    }

    const parsedSegmentId = DocumentSegmentIdSchema.safeParse(segmentId);
    if (!parsedSegmentId.success) {
      return invalidSegmentResponse();
    }

    const { supabase } = await requireProjectRole(pid.data, [
      "owner",
      "editor",
      "viewer",
    ]);

    const service = new DocumentSegmentsService(
      new DocumentSegmentsRepo(supabase)
    );

    const segment = await service.getById({
      projectId: pid.data,
      documentId: parsedDocumentId.data,
      segmentId: parsedSegmentId.data,
    });

    if (!segment) {
      return notFoundResponse();
    }

    return NextResponse.json({ ok: true, segment });
  } catch (e: any) {
    e = normalizeDependencyError(e);
    const mapped = mapSegmentError(e);

    return NextResponse.json(
      { ok: false, error: mapped.error },
      { status: mapped.status }
    );
  }
}

export async function PATCH(
  req: Request,
  ctx: {
    params: Promise<{ id: string; documentId: string; segmentId: string }>;
  }
) {
  try {
    const { id, documentId, segmentId } = await ctx.params;

    const pid = ProjectIdSchema.safeParse(id);
    if (!pid.success) {
      return invalidProjectResponse();
    }

    const parsedDocumentId = DocumentIdSchema.safeParse(documentId);
    if (!parsedDocumentId.success) {
      return invalidDocumentResponse();
    }

    const parsedSegmentId = DocumentSegmentIdSchema.safeParse(segmentId);
    if (!parsedSegmentId.success) {
      return invalidSegmentResponse();
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

    const parsedBody = DocumentSegmentUpdateSchema.safeParse(body);
    if (!parsedBody.success) {
      return validationErrorResponse(parsedBody.error.flatten());
    }

    const service = new DocumentSegmentsService(
      new DocumentSegmentsRepo(supabase)
    );

    const segment = await service.update({
      projectId: pid.data,
      documentId: parsedDocumentId.data,
      segmentId: parsedSegmentId.data,
      input: parsedBody.data,
      actorUserId: user.id,
    });

    if (!segment) {
      return notFoundResponse();
    }

    return NextResponse.json({ ok: true, segment });
  } catch (e: any) {
    e = normalizeDependencyError(e);
    const mapped = mapSegmentError(e);

    return NextResponse.json(
      { ok: false, error: mapped.error },
      { status: mapped.status }
    );
  }
}

export async function DELETE(
  _req: Request,
  ctx: {
    params: Promise<{ id: string; documentId: string; segmentId: string }>;
  }
) {
  try {
    const { id, documentId, segmentId } = await ctx.params;

    const pid = ProjectIdSchema.safeParse(id);
    if (!pid.success) {
      return invalidProjectResponse();
    }

    const parsedDocumentId = DocumentIdSchema.safeParse(documentId);
    if (!parsedDocumentId.success) {
      return invalidDocumentResponse();
    }

    const parsedSegmentId = DocumentSegmentIdSchema.safeParse(segmentId);
    if (!parsedSegmentId.success) {
      return invalidSegmentResponse();
    }

    const { supabase, user } = await requireProjectRole(pid.data, [
      "owner",
      "editor",
    ]);

    const service = new DocumentSegmentsService(
      new DocumentSegmentsRepo(supabase)
    );

    const segment = await service.softDelete({
      projectId: pid.data,
      documentId: parsedDocumentId.data,
      segmentId: parsedSegmentId.data,
      actorUserId: user.id,
    });

    if (!segment) {
      return notFoundResponse();
    }

    return NextResponse.json({ ok: true, segment });
  } catch (e: any) {
    e = normalizeDependencyError(e);
    const mapped = mapSegmentError(e);

    return NextResponse.json(
      { ok: false, error: mapped.error },
      { status: mapped.status }
    );
  }
}
