import { NextResponse } from "next/server";
import { z } from "zod";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { ProjectIdSchema } from "@/src/modules/projects/projects.schema";
import {
  PROJECT_EXPORT_BUNDLE_SCOPES,
  PROJECT_EXPORT_TYPES,
  ProjectExportsOrchestrator,
  type ProjectExportBundleScope,
  type ProjectExportType,
} from "@/src/modules/exports/project-exports.orchestrator";
import {
  renderExportAsDocx,
  renderExportAsMarkdown,
  renderExportAsPdf,
  renderExportBundleAsZip,
  type ProjectExportModel,
} from "@/src/modules/exports/project-exports.service";

export const dynamic = "force-dynamic";

const ExportTypeSchema = z.enum(PROJECT_EXPORT_TYPES);
const ExportFormatSchema = z.enum(["docx", "pdf", "md", "zip"]).default("docx");
const BundleScopeSchema = z.enum(PROJECT_EXPORT_BUNDLE_SCOPES).default("all");

type ProjectExportFormat = z.infer<typeof ExportFormatSchema>;

const CONTENT_TYPES: Record<ProjectExportFormat, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
  md: "text/markdown; charset=utf-8",
  zip: "application/zip",
};

function invalidProjectResponse() {
  return NextResponse.json(
    { ok: false, error: "INVALID_PROJECT_ID" },
    { status: 400 }
  );
}

function validationErrorResponse(details: unknown) {
  return NextResponse.json(
    { ok: false, error: "VALIDATION_ERROR", details },
    { status: 400 }
  );
}

function getErrorStatus(error: unknown) {
  return typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
    ? error.status
    : 500;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Server error";
}

function slugifyFilePart(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function getFileName(params: {
  projectId: string;
  exportType: ProjectExportType;
  format: ProjectExportFormat;
  scope?: ProjectExportBundleScope;
  model?: ProjectExportModel;
}) {
  const base =
    params.model?.title && params.exportType !== "bundle"
      ? slugifyFilePart(params.model.title)
      : `project-${params.projectId}-${params.exportType}${
          params.scope ? `-${params.scope}` : ""
        }`;

  return `${base || params.exportType}.${params.format}`;
}

async function renderModel(model: ProjectExportModel, format: ProjectExportFormat) {
  if (format === "docx") return renderExportAsDocx(model);
  if (format === "pdf") return renderExportAsPdf(model);
  if (format === "md") return Buffer.from(renderExportAsMarkdown(model), "utf8");

  return null;
}

function downloadResponse(params: {
  body: Buffer;
  contentType: string;
  fileName: string;
}) {
  return new Response(new Uint8Array(params.body), {
    status: 200,
    headers: {
      "Content-Type": params.contentType,
      "Content-Disposition": `attachment; filename="${params.fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string; exportType: string }> }
) {
  try {
    const { id, exportType } = await ctx.params;

    const pid = ProjectIdSchema.safeParse(id);
    if (!pid.success) {
      return invalidProjectResponse();
    }

    const parsedType = ExportTypeSchema.safeParse(exportType);
    if (!parsedType.success) {
      return validationErrorResponse(parsedType.error.flatten());
    }

    const url = new URL(req.url);
    const parsedFormat = ExportFormatSchema.safeParse(
      url.searchParams.get("format") ?? undefined
    );
    if (!parsedFormat.success) {
      return validationErrorResponse(parsedFormat.error.flatten());
    }

    const format = parsedType.data === "bundle" ? "zip" : parsedFormat.data;
    const parsedScope = BundleScopeSchema.safeParse(
      url.searchParams.get("scope") ?? undefined
    );
    if (!parsedScope.success) {
      return validationErrorResponse(parsedScope.error.flatten());
    }

    if (format === "zip" && parsedType.data !== "bundle") {
      return validationErrorResponse({
        format: ["ZIP is only available for bundle exports."],
      });
    }

    const { supabase } = await requireProjectRole(pid.data, [
      "owner",
      "editor",
      "viewer",
    ]);
    const orchestrator = new ProjectExportsOrchestrator(supabase);

    if (parsedType.data === "bundle") {
      const models = await orchestrator.buildBundleModels(
        pid.data,
        parsedScope.data
      );
      const body = await renderExportBundleAsZip(models);

      return downloadResponse({
        body,
        contentType: CONTENT_TYPES.zip,
        fileName: getFileName({
          projectId: pid.data,
          exportType: parsedType.data,
          format: "zip",
          scope: parsedScope.data,
        }),
      });
    }

    const model = await orchestrator.buildModel(pid.data, parsedType.data);
    const body = await renderModel(model, format);

    if (!body) {
      return validationErrorResponse({
        format: ["Unsupported export format."],
      });
    }

    return downloadResponse({
      body,
      contentType: CONTENT_TYPES[format],
      fileName: getFileName({
        projectId: pid.data,
        exportType: parsedType.data,
        format,
        model,
      }),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: getErrorMessage(error) },
      { status: getErrorStatus(error) }
    );
  }
}
