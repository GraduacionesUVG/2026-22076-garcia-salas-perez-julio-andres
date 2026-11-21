import { normalizeDependencyError } from "@/src/modules/security/dependency-errors";
import { NextResponse } from "next/server";
import { requireSession } from "@/src/modules/auth/auth.guard";
import { CreateProjectSchema } from "@/src/modules/projects/projects.schema";
import { ProjectsRepo } from "@/src/modules/projects/projects.repo";
import { ProjectsService } from "@/src/modules/projects/projects.service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { supabase, user } = await requireSession();

    const service = new ProjectsService(new ProjectsRepo(supabase));
    const projects = await service.listForUser(user.id);

    return NextResponse.json({ ok: true, projects });
  } catch (e: any) {
    e = normalizeDependencyError(e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: e?.status ?? 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { supabase, user } = await requireSession();

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const parsed = CreateProjectSchema.safeParse(body);
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

    const service = new ProjectsService(new ProjectsRepo(supabase));
    const project = await service.createForUser(user.id, parsed.data);

    return NextResponse.json({ ok: true, project }, { status: 201 });
  } catch (e: any) {
    e = normalizeDependencyError(e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: e?.status ?? 500 }
    );
  }
}
