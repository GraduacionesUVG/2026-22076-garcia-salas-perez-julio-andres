import { normalizeDependencyError } from "@/src/modules/security/dependency-errors";
import { NextResponse } from "next/server";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import {
  ResearchDesignRepo,
  SpecificObjectiveRevisionConflictError,
} from "@/src/modules/research-design/research-design.repo";
import { ResearchDesignService } from "@/src/modules/research-design/research-design.service";
import {
  ProjectIdSchema,
  SpecificObjectiveIdSchema,
  SpecificObjectiveSaveSchema,
} from "@/src/modules/research-design/research-design.schema";

export const dynamic = "force-dynamic";

function notFoundResponse(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 404 });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; objectiveId: string }> }
) {
  try {
    const { id, objectiveId } = await ctx.params;

    const pid = ProjectIdSchema.safeParse(id);
    if (!pid.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid project id" },
        { status: 400 }
      );
    }

    const oid = SpecificObjectiveIdSchema.safeParse(objectiveId);
    if (!oid.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid objective id" },
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

    const parsed = SpecificObjectiveSaveSchema.safeParse(body);
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

    const objective = await service.updateSpecificObjective(
      pid.data,
      oid.data,
      parsed.data,
      {
        actorUserId: user.id,
      }
    );

    if (!objective) {
      return notFoundResponse("OBJECTIVE_NOT_FOUND");
    }

    return NextResponse.json({ ok: true, objective });
  } catch (e: any) {
    e = normalizeDependencyError(e);
    if (e instanceof SpecificObjectiveRevisionConflictError) {
      return NextResponse.json(
        {
          ok: false,
          error: e.message,
          code: e.code,
          latest_objective: e.latest,
        },
        { status: e.status }
      );
    }

    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: e?.status ?? 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; objectiveId: string }> }
) {
  try {
    const { id, objectiveId } = await ctx.params;

    const pid = ProjectIdSchema.safeParse(id);
    if (!pid.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid project id" },
        { status: 400 }
      );
    }

    const oid = SpecificObjectiveIdSchema.safeParse(objectiveId);
    if (!oid.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid objective id" },
        { status: 400 }
      );
    }

    const { supabase, user } = await requireProjectRole(pid.data, [
      "owner",
      "editor",
    ]);

    const service = new ResearchDesignService(
      new ResearchDesignRepo(supabase)
    );

    const result = await service.removeSpecificObjectiveWithCount(
      pid.data,
      oid.data,
      {
        actorUserId: user.id,
      }
    );

    if (result.deletedCount === 0) {
      return notFoundResponse("OBJECTIVE_NOT_FOUND");
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    e = normalizeDependencyError(e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: e?.status ?? 500 }
    );
  }
}
