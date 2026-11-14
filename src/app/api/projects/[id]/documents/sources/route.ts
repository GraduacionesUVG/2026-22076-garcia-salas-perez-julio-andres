import { NextResponse } from "next/server";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { ProjectIdSchema } from "@/src/modules/projects/projects.schema";
import {
  DocumentSourceCreateSchema,
  DocumentSourceListQuerySchema,
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

    const parsedQuery = DocumentSourceListQuerySchema.safeParse(rawQuery);
    if (!parsedQuery.success) {
      return validationErrorResponse(parsedQuery.error.flatten());
    }

    const { supabase } = await requireProjectRole(pid.data, [
      "owner",
      "editor",
      "viewer",
    ]);

    const service = new DocumentSourcesService(
      new DocumentSourcesRepo(supabase)
    );

    const sources = await service.listByProject(pid.data, parsedQuery.data);

    return NextResponse.json({ ok: true, sources });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: e?.status ?? 500 }
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

    const parsedBody = DocumentSourceCreateSchema.safeParse(body);
    if (!parsedBody.success) {
      return validationErrorResponse(parsedBody.error.flatten());
    }

    const service = new DocumentSourcesService(
      new DocumentSourcesRepo(supabase)
    );

    const source = await service.create({
      projectId: pid.data,
      input: parsedBody.data,
      actorUserId: user.id,
    });

    return NextResponse.json({ ok: true, source }, { status: 201 });
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