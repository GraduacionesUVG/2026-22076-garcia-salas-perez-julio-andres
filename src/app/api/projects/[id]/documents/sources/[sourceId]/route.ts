import { NextResponse } from "next/server";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { ProjectIdSchema } from "@/src/modules/projects/projects.schema";
import {
  DocumentSourceIdSchema,
  DocumentSourceUpdateSchema,
} from "@/src/modules/documents/document-sources.schema";
import { DocumentSourcesRepo } from "@/src/modules/documents/document-sources.repo";
import { DocumentSourcesService } from "@/src/modules/documents/document-sources.service";

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

function invalidSourceResponse() {
  return NextResponse.json(
    { ok: false, error: "Invalid source id" },
    { status: 400 }
  );
}

function notFoundResponse() {
  return NextResponse.json(
    { ok: false, error: "DOCUMENT_SOURCE_NOT_FOUND" },
    { status: 404 }
  );
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; sourceId: string }> }
) {
  try {
    const { id, sourceId } = await ctx.params;

    const pid = ProjectIdSchema.safeParse(id);
    if (!pid.success) {
      return invalidProjectResponse();
    }

    const parsedSourceId = DocumentSourceIdSchema.safeParse(sourceId);
    if (!parsedSourceId.success) {
      return invalidSourceResponse();
    }

    const { supabase } = await requireProjectRole(pid.data, [
      "owner",
      "editor",
      "viewer",
    ]);

    const service = new DocumentSourcesService(
      new DocumentSourcesRepo(supabase)
    );

    const source = await service.getById({
      projectId: pid.data,
      sourceId: parsedSourceId.data,
    });

    if (!source) {
      return notFoundResponse();
    }

    return NextResponse.json({ ok: true, source });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: e?.status ?? 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; sourceId: string }> }
) {
  try {
    const { id, sourceId } = await ctx.params;

    const pid = ProjectIdSchema.safeParse(id);
    if (!pid.success) {
      return invalidProjectResponse();
    }

    const parsedSourceId = DocumentSourceIdSchema.safeParse(sourceId);
    if (!parsedSourceId.success) {
      return invalidSourceResponse();
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

    const parsedBody = DocumentSourceUpdateSchema.safeParse(body);
    if (!parsedBody.success) {
      return validationErrorResponse(parsedBody.error.flatten());
    }

    const service = new DocumentSourcesService(
      new DocumentSourcesRepo(supabase)
    );

    const source = await service.update({
      projectId: pid.data,
      sourceId: parsedSourceId.data,
      input: parsedBody.data,
      actorUserId: user.id,
    });

    if (!source) {
      return notFoundResponse();
    }

    return NextResponse.json({ ok: true, source });
  } catch (e: any) {
    const isDuplicateCode = e?.code === "23505";

    return NextResponse.json(
      {
        ok: false,
        error: isDuplicateCode
          ? "DOCUMENT_SOURCE_CODE_ALREADY_EXISTS"
          : e?.message ?? "Server error",
      },
      { status: isDuplicateCode ? 409 : e?.status ?? 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; sourceId: string }> }
) {
  try {
    const { id, sourceId } = await ctx.params;

    const pid = ProjectIdSchema.safeParse(id);
    if (!pid.success) {
      return invalidProjectResponse();
    }

    const parsedSourceId = DocumentSourceIdSchema.safeParse(sourceId);
    if (!parsedSourceId.success) {
      return invalidSourceResponse();
    }

    const { supabase, user } = await requireProjectRole(pid.data, [
      "owner",
      "editor",
    ]);

    const service = new DocumentSourcesService(
      new DocumentSourcesRepo(supabase)
    );

    const source = await service.softDelete({
      projectId: pid.data,
      sourceId: parsedSourceId.data,
      actorUserId: user.id,
    });

    if (!source) {
      return notFoundResponse();
    }

    return NextResponse.json({ ok: true, source });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: e?.status ?? 500 }
    );
  }
}