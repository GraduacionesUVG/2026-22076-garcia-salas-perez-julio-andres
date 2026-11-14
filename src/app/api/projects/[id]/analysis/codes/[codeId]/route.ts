import { NextResponse } from "next/server";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { ProjectIdSchema } from "@/src/modules/projects/projects.schema";
import {
  CodeIdSchema,
  CodeUpdateSchema,
} from "@/src/modules/analysis/analysis-codes.schema";
import { AnalysisCodesRepo } from "@/src/modules/analysis/analysis-codes.repo";
import { AnalysisCodesService } from "@/src/modules/analysis/analysis-codes.service";

export const dynamic = "force-dynamic";

function validationErrorResponse(details: unknown) {
  return NextResponse.json(
    { ok: false, error: "VALIDATION_ERROR", details },
    { status: 400 }
  );
}

function invalidProjectResponse() {
  return NextResponse.json(
    { ok: false, error: "INVALID_PROJECT_ID" },
    { status: 400 }
  );
}

function invalidCodeResponse() {
  return NextResponse.json(
    { ok: false, error: "Invalid code id" },
    { status: 400 }
  );
}

function notFoundResponse() {
  return NextResponse.json(
    { ok: false, error: "CODE_NOT_FOUND" },
    { status: 404 }
  );
}

type RouteError = { message?: string; status?: number; code?: string };

function mapAnalysisError(e: RouteError) {
  if (e?.message === "CODE_REVISION_CONFLICT") {
    return { status: 409, error: "CODE_REVISION_CONFLICT" };
  }

  if (e?.message === "CODE_PARENT_CYCLE") {
    return { status: 409, error: "CODE_PARENT_CYCLE" };
  }

  if (e?.message === "CODE_ALREADY_EXISTS" || e?.code === "23505") {
    return { status: 409, error: "CODE_ALREADY_EXISTS" };
  }

  if (e?.message === "CODE_NOT_FOUND") {
    return { status: 404, error: "CODE_NOT_FOUND" };
  }

  if (
    e?.message === "CODE_HAS_ACTIVE_CHILDREN" ||
    e?.message === "CODE_HAS_ACTIVE_ASSIGNMENTS"
  ) {
    return { status: 409, error: e.message };
  }

  const status = e?.status ?? 500;
  return {
    status,
    error: status >= 500 ? "Server error" : e?.message ?? "Request failed",
  };
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; codeId: string }> }
) {
  try {
    const { id, codeId } = await ctx.params;

    const pid = ProjectIdSchema.safeParse(id);
    if (!pid.success) {
      return invalidProjectResponse();
    }

    const parsedCodeId = CodeIdSchema.safeParse(codeId);
    if (!parsedCodeId.success) {
      return invalidCodeResponse();
    }

    const { supabase } = await requireProjectRole(pid.data, [
      "owner",
      "editor",
      "viewer",
    ]);

    const service = new AnalysisCodesService(new AnalysisCodesRepo(supabase));
    const code = await service.getById({
      projectId: pid.data,
      codeId: parsedCodeId.data,
    });

    if (!code) {
      return notFoundResponse();
    }

    return NextResponse.json({ ok: true, code });
  } catch (e: unknown) {
    const mapped = mapAnalysisError(e as RouteError);

    return NextResponse.json(
      { ok: false, error: mapped.error },
      { status: mapped.status }
    );
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; codeId: string }> }
) {
  try {
    const { id, codeId } = await ctx.params;

    const pid = ProjectIdSchema.safeParse(id);
    if (!pid.success) {
      return invalidProjectResponse();
    }

    const parsedCodeId = CodeIdSchema.safeParse(codeId);
    if (!parsedCodeId.success) {
      return invalidCodeResponse();
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

    const parsedBody = CodeUpdateSchema.safeParse(body);
    if (!parsedBody.success) {
      return validationErrorResponse(parsedBody.error.flatten());
    }

    const service = new AnalysisCodesService(new AnalysisCodesRepo(supabase));
    const code = await service.update({
      projectId: pid.data,
      codeId: parsedCodeId.data,
      input: parsedBody.data,
      actorUserId: user.id,
    });

    if (!code) {
      return notFoundResponse();
    }

    return NextResponse.json({ ok: true, code });
  } catch (e: unknown) {
    const mapped = mapAnalysisError(e as RouteError);

    return NextResponse.json(
      { ok: false, error: mapped.error },
      { status: mapped.status }
    );
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; codeId: string }> }
) {
  try {
    const { id, codeId } = await ctx.params;

    const pid = ProjectIdSchema.safeParse(id);
    if (!pid.success) {
      return invalidProjectResponse();
    }

    const parsedCodeId = CodeIdSchema.safeParse(codeId);
    if (!parsedCodeId.success) {
      return invalidCodeResponse();
    }

    const { supabase, user } = await requireProjectRole(pid.data, [
      "owner",
      "editor",
    ]);

    const service = new AnalysisCodesService(new AnalysisCodesRepo(supabase));
    const code = await service.softDelete({
      projectId: pid.data,
      codeId: parsedCodeId.data,
      actorUserId: user.id,
    });

    if (!code) {
      return notFoundResponse();
    }

    return NextResponse.json({ ok: true, code });
  } catch (e: unknown) {
    const mapped = mapAnalysisError(e as RouteError);

    return NextResponse.json(
      { ok: false, error: mapped.error },
      { status: mapped.status }
    );
  }
}
