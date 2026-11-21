import { NextResponse } from "next/server";
import { ProjectIdSchema } from "@/src/modules/projects/projects.schema";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { ProjectWorkflowRepo } from "@/src/modules/projects/project-workflow.repo";
import { ProjectWorkflowService } from "@/src/modules/projects/project-workflow.service";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const parsedId = ProjectIdSchema.safeParse(id);

    if (!parsedId.success) {
      return NextResponse.json(
        { ok: false, error: "INVALID_PROJECT_ID" },
        { status: 400 }
      );
    }

    const { supabase } = await requireProjectRole(parsedId.data, [
      "owner",
      "editor",
      "viewer",
    ]);
    const service = new ProjectWorkflowService(
      new ProjectWorkflowRepo(supabase)
    );
    const workflow = await service.getSummary(parsedId.data);

    return NextResponse.json({ ok: true, workflow });
  } catch (error: unknown) {
    const status =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      typeof error.status === "number"
        ? error.status
        : 500;

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Server error",
      },
      { status }
    );
  }
}
