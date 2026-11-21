import { NextResponse } from "next/server";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { ProjectIdSchema } from "@/src/modules/projects/projects.schema";
import {
  CodeCreateSchema,
  CodeListQuerySchema,
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

type RouteError = { message?: string; status?: number; code?: string };

function mapAnalysisError(e: RouteError) {
  if (e?.message === "CODE_PARENT_CYCLE") {
    return { status: 409, error: "CODE_PARENT_CYCLE" };
  }

  if (e?.message === "CODE_ALREADY_EXISTS") {
    return { status: 409, error: "CODE_ALREADY_EXISTS" };
  }

  if (e?.message === "CODE_NOT_FOUND") {
    return { status: 404, error: "CODE_NOT_FOUND" };
  }

  if (e?.code === "23505") {
    return { status: 409, error: "CODE_ALREADY_EXISTS" };
  }

  const status = e?.status ?? 500;
  return {
    status,
    error: status >= 500 ? "Server error" : e?.message ?? "Request failed",
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

    const parsedQuery = CodeListQuerySchema.safeParse(rawQuery);
    if (!parsedQuery.success) {
      return validationErrorResponse(parsedQuery.error.flatten());
    }

    const { supabase } = await requireProjectRole(pid.data, [
      "owner",
      "editor",
      "viewer",
    ]);

    const service = new AnalysisCodesService(new AnalysisCodesRepo(supabase));
    const codes = await service.listByProject(pid.data, parsedQuery.data);

    return NextResponse.json({ ok: true, codes });
  } catch (e: unknown) {
    const mapped = mapAnalysisError(e as RouteError);

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

    const parsedBody = CodeCreateSchema.safeParse(body);
    if (!parsedBody.success) {
      return validationErrorResponse(parsedBody.error.flatten());
    }

    const service = new AnalysisCodesService(new AnalysisCodesRepo(supabase));
    const code = await service.create({
      projectId: pid.data,
      input: parsedBody.data,
      actorUserId: user.id,
    });

    return NextResponse.json({ ok: true, code }, { status: 201 });
  } catch (e: unknown) {
    const mapped = mapAnalysisError(e as RouteError);

    return NextResponse.json(
      { ok: false, error: mapped.error },
      { status: mapped.status }
    );
  }
}
