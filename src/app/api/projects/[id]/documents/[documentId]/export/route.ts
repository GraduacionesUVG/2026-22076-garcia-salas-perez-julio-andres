import { normalizeDependencyError } from "@/src/modules/security/dependency-errors";
import { NextResponse } from "next/server";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { ProjectIdSchema } from "@/src/modules/projects/projects.schema";
import { DocumentIdSchema } from "@/src/modules/documents/documents.schema";
import { DocumentsRepo } from "@/src/modules/documents/documents.repo";
import { DocumentsService } from "@/src/modules/documents/documents.service";

export const dynamic = "force-dynamic";

function slugifyFilePart(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function invalidResponse(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string; documentId: string }> }
) {
  try {
    const { id, documentId } = await ctx.params;
    const pid = ProjectIdSchema.safeParse(id);
    const did = DocumentIdSchema.safeParse(documentId);

    if (!pid.success) return invalidResponse("INVALID_PROJECT_ID");
    if (!did.success) return invalidResponse("INVALID_DOCUMENT_ID");

    const url = new URL(req.url);
    const format = url.searchParams.get("format") ?? "txt";

    if (format !== "txt") {
      return invalidResponse("UNSUPPORTED_DOCUMENT_EXPORT_FORMAT");
    }

    const { supabase } = await requireProjectRole(pid.data, [
      "owner",
      "editor",
      "viewer",
    ]);
    const service = new DocumentsService(new DocumentsRepo(supabase));
    const document = await service.getById({
      projectId: pid.data,
      documentId: did.data,
    });

    if (!document) {
      return NextResponse.json(
        { ok: false, error: "DOCUMENT_NOT_FOUND" },
        { status: 404 }
      );
    }

    const fileName = `${slugifyFilePart(document.title) || "documento"}.txt`;
    const body = [
      document.title,
      "",
      `Tipo: ${document.document_type}`,
      `Estado: ${document.status}`,
      document.location ? `Lugar: ${document.location}` : "",
      document.notes ? `Notas: ${document.notes}` : "",
      document.metadata && Object.keys(document.metadata).length > 0
        ? `Metadatos: ${JSON.stringify(document.metadata)}`
        : "",
      "",
      document.content,
    ]
      .filter((line) => line !== "")
      .join("\n");

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    error = normalizeDependencyError(error);
    const routeError = error as { message?: string; status?: number };

    return NextResponse.json(
      { ok: false, error: routeError?.message ?? "Server error" },
      { status: routeError?.status ?? 500 }
    );
  }
}
