import { normalizeDependencyError } from "@/src/modules/security/dependency-errors";
import { NextResponse } from "next/server";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { ProjectIdSchema } from "@/src/modules/projects/projects.schema";
import { DocumentSegmentIdSchema } from "@/src/modules/documents/document-segments.schema";
import {
  SegmentCodeCreateSchema,
  SegmentCodeListQuerySchema,
} from "@/src/modules/analysis/analysis-segment-codes.schema";
import { AnalysisSegmentCodesRepo } from "@/src/modules/analysis/analysis-segment-codes.repo";
import { AnalysisSegmentCodesService } from "@/src/modules/analysis/analysis-segment-codes.service";

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

function invalidSegmentResponse() {
  return NextResponse.json(
    { ok: false, error: "Invalid segment id" },
    { status: 400 }
  );
}

function notFoundResponse() {
  return NextResponse.json(
    { ok: false, error: "SEGMENT_CODE_NOT_FOUND" },
    { status: 404 }
  );
}

type RouteError = { message?: string; status?: number; code?: string };

function mapAnalysisError(e: RouteError) {
  if (e?.message === "CODE_NOT_FOUND") {
    return { status: 404, error: "CODE_NOT_FOUND" };
  }

  if (e?.message === "SEGMENT_CODE_ALREADY_EXISTS" || e?.code === "23505") {
    return { status: 409, error: "SEGMENT_CODE_ALREADY_EXISTS" };
  }

  return { status: e?.status ?? 500, error: e?.message ?? "Server error" };
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string; segmentId: string }> }
) {
  try {
    const { id, segmentId } = await ctx.params;

    const pid = ProjectIdSchema.safeParse(id);
    if (!pid.success) {
      return invalidProjectResponse();
    }

    const parsedSegmentId = DocumentSegmentIdSchema.safeParse(segmentId);
    if (!parsedSegmentId.success) {
      return invalidSegmentResponse();
    }

    const url = new URL(req.url);
    const rawQuery = Object.fromEntries(url.searchParams.entries());

    const parsedQuery = SegmentCodeListQuerySchema.safeParse(rawQuery);
    if (!parsedQuery.success) {
      return validationErrorResponse(parsedQuery.error.flatten());
    }

    const { supabase } = await requireProjectRole(pid.data, [
      "owner",
      "editor",
      "viewer",
    ]);

    const service = new AnalysisSegmentCodesService(
      new AnalysisSegmentCodesRepo(supabase)
    );
    const segmentCodes = await service.listBySegment({
      projectId: pid.data,
      segmentId: parsedSegmentId.data,
      query: parsedQuery.data,
    });

    if (!segmentCodes) {
      return notFoundResponse();
    }

    return NextResponse.json({ ok: true, segment_codes: segmentCodes });
  } catch (e: unknown) {
    e = normalizeDependencyError(e);
    const mapped = mapAnalysisError(e as RouteError);

    return NextResponse.json(
      { ok: false, error: mapped.error },
      { status: mapped.status }
    );
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; segmentId: string }> }
) {
  try {
    const { id, segmentId } = await ctx.params;

    const pid = ProjectIdSchema.safeParse(id);
    if (!pid.success) {
      return invalidProjectResponse();
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

    const parsedBody = SegmentCodeCreateSchema.safeParse(body);
    if (!parsedBody.success) {
      return validationErrorResponse(parsedBody.error.flatten());
    }

    const service = new AnalysisSegmentCodesService(
      new AnalysisSegmentCodesRepo(supabase)
    );
    const segmentCode = await service.create({
      projectId: pid.data,
      segmentId: parsedSegmentId.data,
      input: parsedBody.data,
      actorUserId: user.id,
    });

    if (!segmentCode) {
      return notFoundResponse();
    }

    return NextResponse.json(
      { ok: true, segment_code: segmentCode },
      { status: 201 }
    );
  } catch (e: unknown) {
    e = normalizeDependencyError(e);
    const mapped = mapAnalysisError(e as RouteError);

    return NextResponse.json(
      { ok: false, error: mapped.error },
      { status: mapped.status }
    );
  }
}
