import { normalizeDependencyError } from "@/src/modules/security/dependency-errors";
import { NextResponse } from "next/server";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { ProjectIdSchema } from "@/src/modules/projects/projects.schema";
import {
  MemoIdSchema,
  MemoLinkIdSchema,
} from "@/src/modules/analysis/analysis-memos.schema";
import { AnalysisMemosRepo } from "@/src/modules/analysis/analysis-memos.repo";
import { AnalysisMemosService } from "@/src/modules/analysis/analysis-memos.service";

export const dynamic = "force-dynamic";

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

function invalidLinkResponse() {
  return NextResponse.json(
    { ok: false, error: "Invalid memo link id" },
    { status: 400 }
  );
}

function notFoundResponse() {
  return NextResponse.json(
    { ok: false, error: "MEMO_LINK_NOT_FOUND" },
    { status: 404 }
  );
}

type RouteError = { message?: string; status?: number; code?: string };

function mapAnalysisError(e: RouteError) {
  return { status: e?.status ?? 500, error: e?.message ?? "Server error" };
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; memoId: string; linkId: string }> }
) {
  try {
    const { id, memoId, linkId } = await ctx.params;

    const pid = ProjectIdSchema.safeParse(id);
    if (!pid.success) {
      return invalidProjectResponse();
    }

    const parsedMemoId = MemoIdSchema.safeParse(memoId);
    if (!parsedMemoId.success) {
      return invalidMemoResponse();
    }

    const parsedLinkId = MemoLinkIdSchema.safeParse(linkId);
    if (!parsedLinkId.success) {
      return invalidLinkResponse();
    }

    const { supabase, user } = await requireProjectRole(pid.data, [
      "owner",
      "editor",
    ]);

    const service = new AnalysisMemosService(new AnalysisMemosRepo(supabase));
    const link = await service.deleteLink({
      projectId: pid.data,
      memoId: parsedMemoId.data,
      linkId: parsedLinkId.data,
      actorUserId: user.id,
    });

    if (!link) {
      return notFoundResponse();
    }

    return NextResponse.json({ ok: true, link });
  } catch (e: unknown) {
    e = normalizeDependencyError(e);
    const mapped = mapAnalysisError(e as RouteError);

    return NextResponse.json(
      { ok: false, error: mapped.error },
      { status: mapped.status }
    );
  }
}
