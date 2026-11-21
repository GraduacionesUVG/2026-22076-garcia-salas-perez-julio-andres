import { NextResponse } from "next/server";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { ProjectIdSchema } from "@/src/modules/projects/projects.schema";
import { DocumentIdSchema } from "@/src/modules/documents/documents.schema";
import {
  DocumentVersionCreateSchema,
  DocumentVersionListQuerySchema,
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

function notFoundResponse() {
  return NextResponse.json(
    { ok: false, error: "DOCUMENT_NOT_FOUND" },
    { status: 404 }
  );
}

export async function GET(
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

    const url = new URL(req.url);
    const rawQuery = Object.fromEntries(url.searchParams.entries());

    const parsedQuery = DocumentVersionListQuerySchema.safeParse(rawQuery);
    if (!parsedQuery.success) {
      return validationErrorResponse(parsedQuery.error.flatten());
    }

    const { supabase } = await requireProjectRole(pid.data, [
      "owner",
      "editor",
      "viewer",
    ]);

    const service = new DocumentVersionsService(
      new DocumentVersionsRepo(supabase)
    );

    const versions = await service.listByDocument({
      projectId: pid.data,
      documentId: parsedDocumentId.data,
      query: parsedQuery.data,
    });

    if (!versions) {
      return notFoundResponse();
    }

    return NextResponse.json({ ok: true, versions });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: e?.status ?? 500 }
    );
  }
}

export async function POST(
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

    const parsedBody = DocumentVersionCreateSchema.safeParse(body);
    if (!parsedBody.success) {
      return validationErrorResponse(parsedBody.error.flatten());
    }

    const service = new DocumentVersionsService(
      new DocumentVersionsRepo(supabase)
    );

    const version = await service.create({
      projectId: pid.data,
      documentId: parsedDocumentId.data,
      input: parsedBody.data,
      actorUserId: user.id,
    });

    if (!version) {
      return notFoundResponse();
    }

    return NextResponse.json({ ok: true, version }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: e?.status ?? 500 }
    );
  }
}
