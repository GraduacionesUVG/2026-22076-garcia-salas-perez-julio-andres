import { normalizeDependencyError } from "@/src/modules/security/dependency-errors";
import { NextResponse } from "next/server";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import {
  ResearchDesignRepo,
  ResearchDesignRevisionConflictError,
} from "@/src/modules/research-design/research-design.repo";
import { ResearchDesignService } from "@/src/modules/research-design/research-design.service";
import { DelimitationRepo } from "@/src/modules/delimitation/delimitation.repo";
import { DelimitationService } from "@/src/modules/delimitation/delimitation.service";
import { evaluateResearchDesign } from "@/src/modules/research-design/research-design-heuristics";
import {
  ProjectIdSchema,
  ResearchDesignSaveSchema,
} from "@/src/modules/research-design/research-design.schema";

export const dynamic = "force-dynamic";

function getErrorStatus(error: unknown) {
  return typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
    ? error.status
    : 500;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

async function handleUpdate(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;

    const pid = ProjectIdSchema.safeParse(id);
    if (!pid.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid project id" },
        { status: 400 }
      );
    }

    const { supabase, user } = await requireProjectRole(pid.data, [
      "owner",
      "editor",
    ]);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const parsed = ResearchDesignSaveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Validation error",
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const service = new ResearchDesignService(
      new ResearchDesignRepo(supabase)
    );

    const design = await service.update(pid.data, parsed.data, {
      actorUserId: user.id,
    });

    return NextResponse.json({ ok: true, design });
  } catch (e: unknown) {
    e = normalizeDependencyError(e);
    if (e instanceof ResearchDesignRevisionConflictError) {
      return NextResponse.json(
        {
          ok: false,
          error: e.message,
          code: e.code,
          latest_design: e.latest,
        },
        { status: e.status }
      );
    }

    return NextResponse.json(
      { ok: false, error: getErrorMessage(e) },
      { status: getErrorStatus(e) }
    );
  }
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;

    const pid = ProjectIdSchema.safeParse(id);
    if (!pid.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid project id" },
        { status: 400 }
      );
    }

    const { supabase } = await requireProjectRole(pid.data, [
      "owner",
      "editor",
      "viewer",
    ]);

    const service = new ResearchDesignService(
      new ResearchDesignRepo(supabase)
    );

    const data = await service.getFull(pid.data);
    const hasEvaluableContent =
      Boolean(data.design.research_question?.trim()) ||
      Boolean(data.design.general_objective?.trim()) ||
      data.specific_objectives.some((item) => Boolean(item.text?.trim()));

    let evaluation = null;

    if (hasEvaluableContent) {
      const delimitationService = new DelimitationService(
        new DelimitationRepo(supabase)
      );
      const delimitation = await delimitationService.getFull(pid.data);
      evaluation = evaluateResearchDesign(
        data.design,
        data.specific_objectives,
        delimitation
      );
    }

    return NextResponse.json({ ok: true, data: { ...data, evaluation } });
  } catch (e: unknown) {
    e = normalizeDependencyError(e);
    return NextResponse.json(
      { ok: false, error: getErrorMessage(e) },
      { status: getErrorStatus(e) }
    );
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  return handleUpdate(req, ctx);
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  return handleUpdate(req, ctx);
}
