import { normalizeDependencyError } from "@/src/modules/security/dependency-errors";
import { NextResponse } from "next/server";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { ProjectIdSchema } from "@/src/modules/projects/projects.schema";
import {
  MemoIdSchema,
  MemoUpdateSchema,
} from "@/src/modules/analysis/analysis-memos.schema";
import { AnalysisMemosRepo } from "@/src/modules/analysis/analysis-memos.repo";
import { AnalysisMemosService } from "@/src/modules/analysis/analysis-memos.service";

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

function invalidMemoResponse() {
  return NextResponse.json(
    { ok: false, error: "Invalid memo id" },
    { status: 400 }
  );
}

function notFoundResponse() {
  return NextResponse.json(
    { ok: false, error: "MEMO_NOT_FOUND" },
    { status: 404 }
  );
}

type RouteError = { message?: string; status?: number; code?: string };

function mapAnalysisError(e: RouteError) {
  if (e?.message === "MEMO_REVISION_CONFLICT") {
    return { status: 409, error: "MEMO_REVISION_CONFLICT" };
  }

  return { status: e?.status ?? 500, error: e?.message ?? "Server error" };
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; memoId: string }> }
) {
  try {
    const { id, memoId } = await ctx.params;

    const pid = ProjectIdSchema.safeParse(id);
    if (!pid.success) {
      return invalidProjectResponse();
    }

    const parsedMemoId = MemoIdSchema.safeParse(memoId);
    if (!parsedMemoId.success) {
      return invalidMemoResponse();
    }

    const { supabase } = await requireProjectRole(pid.data, [
      "owner",
      "editor",
      "viewer",
    ]);

    const service = new AnalysisMemosService(new AnalysisMemosRepo(supabase));
    const memo = await service.getById({
      projectId: pid.data,
      memoId: parsedMemoId.data,
    });

    if (!memo) {
      return notFoundResponse();
    }

    return NextResponse.json({ ok: true, memo });
  } catch (e: unknown) {
    e = normalizeDependencyError(e);
    const mapped = mapAnalysisError(e as RouteError);

    return NextResponse.json(
      { ok: false, error: mapped.error },
      { status: mapped.status }
    );
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; memoId: string }> }
) {
  try {
    const { id, memoId } = await ctx.params;

    const pid = ProjectIdSchema.safeParse(id);
    if (!pid.success) {
      return invalidProjectResponse();
    }

    const parsedMemoId = MemoIdSchema.safeParse(memoId);
    if (!parsedMemoId.success) {
      return invalidMemoResponse();
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

    const parsedBody = MemoUpdateSchema.safeParse(body);
    if (!parsedBody.success) {
      return validationErrorResponse(parsedBody.error.flatten());
    }

    const service = new AnalysisMemosService(new AnalysisMemosRepo(supabase));
    const memo = await service.update({
      projectId: pid.data,
      memoId: parsedMemoId.data,
      input: parsedBody.data,
      actorUserId: user.id,
    });

    if (!memo) {
      return notFoundResponse();
    }

    return NextResponse.json({ ok: true, memo });
  } catch (e: unknown) {
    e = normalizeDependencyError(e);
    const mapped = mapAnalysisError(e as RouteError);

    return NextResponse.json(
      { ok: false, error: mapped.error },
      { status: mapped.status }
    );
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; memoId: string }> }
) {
  try {
    const { id, memoId } = await ctx.params;

    const pid = ProjectIdSchema.safeParse(id);
    if (!pid.success) {
      return invalidProjectResponse();
    }

    const parsedMemoId = MemoIdSchema.safeParse(memoId);
    if (!parsedMemoId.success) {
      return invalidMemoResponse();
    }

    const { supabase, user } = await requireProjectRole(pid.data, [
      "owner",
      "editor",
    ]);

    const service = new AnalysisMemosService(new AnalysisMemosRepo(supabase));
    const memo = await service.softDelete({
      projectId: pid.data,
      memoId: parsedMemoId.data,
      actorUserId: user.id,
    });

    if (!memo) {
      return notFoundResponse();
    }

    return NextResponse.json({ ok: true, memo });
  } catch (e: unknown) {
    e = normalizeDependencyError(e);
    const mapped = mapAnalysisError(e as RouteError);

    return NextResponse.json(
      { ok: false, error: mapped.error },
      { status: mapped.status }
    );
  }
}
