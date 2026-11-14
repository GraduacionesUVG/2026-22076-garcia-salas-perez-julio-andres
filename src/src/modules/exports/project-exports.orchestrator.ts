import type { ServerSupabase } from "@/src/modules/auth/auth.guard";
import { AnalysisCodesRepo } from "@/src/modules/analysis/analysis-codes.repo";
import { AnalysisCodesService } from "@/src/modules/analysis/analysis-codes.service";
import { AnalysisInsightsRepo } from "@/src/modules/analysis/analysis-insights.repo";
import { AnalysisInsightsService } from "@/src/modules/analysis/analysis-insights.service";
import { AnalysisOverviewRepo } from "@/src/modules/analysis/analysis-overview.repo";
import { AnalysisOverviewService } from "@/src/modules/analysis/analysis-overview.service";
import { DelimitationRepo } from "@/src/modules/delimitation/delimitation.repo";
import { DocumentsRepo } from "@/src/modules/documents/documents.repo";
import { ParticipantsRepo } from "@/src/modules/participants/participants.repo";
import { ProjectsRepo } from "@/src/modules/projects/projects.repo";
import { ResearchDesignRepo } from "@/src/modules/research-design/research-design.repo";
import { SampleConfigRepo } from "@/src/modules/sample-config/sample-config.repo";
import { SampleConfigService } from "@/src/modules/sample-config/sample-config.service";
import {
  buildCodebookExportModel,
  buildDashboardExportModel,
  buildEvidenceByCodeExportModel,
  buildInsightsExportModel,
  buildProtocolExportModel,
  buildQuotesExportModel,
  type ProjectExportModel,
} from "./project-exports.service";

export const PROJECT_EXPORT_TYPES = [
  "codebook",
  "evidence",
  "quotes",
  "insights",
  "dashboard",
  "protocol",
  "bundle",
] as const;

export type ProjectExportType = (typeof PROJECT_EXPORT_TYPES)[number];
export const PROJECT_EXPORT_BUNDLE_SCOPES = [
  "protocol",
  "evidence",
  "report",
  "all",
] as const;

export type ProjectExportBundleScope =
  (typeof PROJECT_EXPORT_BUNDLE_SCOPES)[number];

const EXPORT_QUERY = { limit: 200, offset: 0 };
const ALL_BUNDLE_TYPES: Array<Exclude<ProjectExportType, "bundle">> = [
  "protocol",
  "codebook",
  "evidence",
  "quotes",
  "dashboard",
  "insights",
];

export function getProjectExportTypesForBundleScope(
  scope: ProjectExportBundleScope = "all"
): Array<Exclude<ProjectExportType, "bundle">> {
  if (scope === "protocol") return ["protocol"];
  if (scope === "evidence") return ["codebook", "evidence", "quotes"];
  if (scope === "report") return ["dashboard", "insights"];

  return ALL_BUNDLE_TYPES;
}

function makeNotFoundError(message: string) {
  const error = new Error(message) as Error & { status?: number };
  error.status = 404;
  return error;
}

function normalizeProjectName(value: string | null | undefined) {
  return value?.trim() || "Proyecto";
}

export class ProjectExportsOrchestrator {
  private readonly projectsRepo: ProjectsRepo;
  private readonly codesService: AnalysisCodesService;
  private readonly insightsService: AnalysisInsightsService;
  private readonly overviewService: AnalysisOverviewService;
  private readonly delimitationRepo: DelimitationRepo;
  private readonly researchDesignRepo: ResearchDesignRepo;
  private readonly sampleConfigService: SampleConfigService;
  private readonly participantsRepo: ParticipantsRepo;
  private readonly documentsRepo: DocumentsRepo;

  constructor(supabase: ServerSupabase) {
    this.projectsRepo = new ProjectsRepo(supabase);
    this.codesService = new AnalysisCodesService(new AnalysisCodesRepo(supabase));
    this.insightsService = new AnalysisInsightsService(
      new AnalysisInsightsRepo(supabase)
    );
    this.overviewService = new AnalysisOverviewService(
      new AnalysisOverviewRepo(supabase)
    );
    this.delimitationRepo = new DelimitationRepo(supabase);
    this.researchDesignRepo = new ResearchDesignRepo(supabase);
    this.sampleConfigService = new SampleConfigService(
      new SampleConfigRepo(supabase)
    );
    this.participantsRepo = new ParticipantsRepo(supabase);
    this.documentsRepo = new DocumentsRepo(supabase);
  }

  private async getProjectName(projectId: string) {
    const project = await this.projectsRepo.getById(projectId);

    if (!project) {
      throw makeNotFoundError("PROJECT_NOT_FOUND");
    }

    return normalizeProjectName(project.name);
  }

  private async getCodesAndStats(projectId: string) {
    const [codes, codeStats] = await Promise.all([
      this.codesService.listByProject(projectId, {
        ...EXPORT_QUERY,
        include_deleted: false,
      }),
      this.overviewService.getCodeUsageStats(projectId, EXPORT_QUERY),
    ]);

    return { codes, codeStats };
  }

  async buildModel(
    projectId: string,
    exportType: Exclude<ProjectExportType, "bundle">
  ): Promise<ProjectExportModel> {
    const projectName = await this.getProjectName(projectId);

    if (exportType === "codebook") {
      const { codes, codeStats } = await this.getCodesAndStats(projectId);

      return buildCodebookExportModel({ projectName, codes, codeStats });
    }

    if (exportType === "evidence" || exportType === "quotes") {
      const [codes, documentPatterns] = await Promise.all([
        this.codesService.listByProject(projectId, {
          ...EXPORT_QUERY,
          include_deleted: false,
        }),
        this.overviewService.getDocumentPatterns(projectId, EXPORT_QUERY),
      ]);

      return exportType === "evidence"
        ? buildEvidenceByCodeExportModel({ projectName, codes, documentPatterns })
        : buildQuotesExportModel({ projectName, codes, documentPatterns });
    }

    if (exportType === "insights") {
      const insights = await this.insightsService.listByProject(projectId, {
        ...EXPORT_QUERY,
        include_deleted: false,
        include_links: false,
      });

      return buildInsightsExportModel({ projectName, insights });
    }

    if (exportType === "dashboard") {
      const [snapshot, codes] = await Promise.all([
        this.overviewService.getDashboardSnapshot(projectId),
        this.codesService.listByProject(projectId, {
          ...EXPORT_QUERY,
          include_deleted: false,
        }),
      ]);

      return buildDashboardExportModel({ projectName, snapshot, codes });
    }

    const [
      delimitation,
      delimitationItems,
      researchDesign,
      specificObjectives,
      sample,
      participants,
      documents,
    ] = await Promise.all([
      this.delimitationRepo.getDelimitation(projectId),
      this.delimitationRepo.getItems(projectId),
      this.researchDesignRepo.getResearchDesign(projectId),
      this.researchDesignRepo.getSpecificObjectives(projectId),
      this.sampleConfigService.getFull(projectId),
      this.participantsRepo.listByProject(projectId, {
        ...EXPORT_QUERY,
        include_deleted: false,
      }),
      this.documentsRepo.listByProject(projectId, {
        ...EXPORT_QUERY,
        include_deleted: false,
      }),
    ]);

    return buildProtocolExportModel({
      projectName,
      delimitation,
      delimitationItems,
      researchDesign,
      specificObjectives,
      sample,
      participants,
      documents,
    });
  }

  async buildBundleModels(
    projectId: string,
    scope: ProjectExportBundleScope = "all"
  ) {
    const types = getProjectExportTypesForBundleScope(scope);

    return Promise.all(types.map((type) => this.buildModel(projectId, type)));
  }
}
