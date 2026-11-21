import { normalizeDependencyError } from "@/src/modules/security/dependency-errors";
import { NextResponse } from "next/server";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { ProjectIdSchema } from "@/src/modules/projects/projects.schema";
import {
  DocumentCreateSchema,
  DocumentListQuerySchema,
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

function mapDatabaseError(e: any) {
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
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;

    const pid = ProjectIdSchema.safeParse(id);
    if (!pid.success) {
      return invalidProjectResponse();
    }

    const url = new URL(req.url);
    const rawQuery = Object.fromEntries(url.searchParams.entries());

    const parsedQuery = DocumentListQuerySchema.safeParse(rawQuery);
    if (!parsedQuery.success) {
      return validationErrorResponse(parsedQuery.error.flatten());
    }

    const { supabase } = await requireProjectRole(pid.data, [
      "owner",
      "editor",
      "viewer",
    ]);

    const service = new DocumentsService(new DocumentsRepo(supabase));
    const documents = await service.listByProject(pid.data, parsedQuery.data);

    return NextResponse.json({ ok: true, documents });
  } catch (e: any) {
    e = normalizeDependencyError(e);
    const mapped = mapDatabaseError(e);

    return NextResponse.json(
      { ok: false, error: mapped.error },
      { status: mapped.status }
    );
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;

    const pid = ProjectIdSchema.safeParse(id);
    if (!pid.success) {
      return invalidProjectResponse();
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

    const parsedBody = DocumentCreateSchema.safeParse(body);
    if (!parsedBody.success) {
      return validationErrorResponse(parsedBody.error.flatten());
    }

    const service = new DocumentsService(new DocumentsRepo(supabase));
    const document = await service.create({
      projectId: pid.data,
      input: parsedBody.data,
      actorUserId: user.id,
    });

    return NextResponse.json({ ok: true, document }, { status: 201 });
  } catch (e: any) {
    e = normalizeDependencyError(e);
    const mapped = mapDatabaseError(e);

    return NextResponse.json(
      { ok: false, error: mapped.error },
      { status: mapped.status }
    );
  }
}
