import { normalizeDependencyError } from "@/src/modules/security/dependency-errors";
import { NextResponse } from "next/server";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import {
  ProjectIdSchema,
  UpdateProjectSchema,
} from "@/src/modules/projects/projects.schema";
import { ProjectsRepo } from "@/src/modules/projects/projects.repo";
import { ProjectsService } from "@/src/modules/projects/projects.service";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const parsedId = ProjectIdSchema.safeParse(id);
    if (!parsedId.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid project id" },
        { status: 400 }
      );
    }

    const { supabase, member } = await requireProjectRole(parsedId.data, [
      "owner",
      "editor",
      "viewer",
    ]);

    const service = new ProjectsService(new ProjectsRepo(supabase));
    const project = await service.getById(parsedId.data, member.role);

    if (!project) {
      return NextResponse.json(
        { ok: false, error: "Project not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, project });
  } catch (e: any) {
    e = normalizeDependencyError(e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: e?.status ?? 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const parsedId = ProjectIdSchema.safeParse(id);
    if (!parsedId.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid project id" },
        { status: 400 }
      );
    }

    const { supabase, member } = await requireProjectRole(parsedId.data, [
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

    const parsedBody = UpdateProjectSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Validation error",
          details: parsedBody.error.flatten(),
        },
        { status: 400 }
      );
    }

    const service = new ProjectsService(new ProjectsRepo(supabase));
    const project = await service.updateById(
      parsedId.data,
      member.role,
      parsedBody.data
    );

    if (!project) {
      return NextResponse.json(
        { ok: false, error: "Project not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, project });
  } catch (e: any) {
    e = normalizeDependencyError(e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: e?.status ?? 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const parsedId = ProjectIdSchema.safeParse(id);
    if (!parsedId.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid project id" },
        { status: 400 }
      );
    }

    const { supabase } = await requireProjectRole(parsedId.data, ["owner"]);

    const service = new ProjectsService(new ProjectsRepo(supabase));
    await service.deleteById(parsedId.data);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    e = normalizeDependencyError(e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: e?.status ?? 500 }
    );
  }
}
