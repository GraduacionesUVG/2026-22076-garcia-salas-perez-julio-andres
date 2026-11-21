import type { ServerSupabase } from "@/src/modules/auth/auth.guard";
import type { OverviewLimitOffsetQuery } from "./analysis-overview.service";

export type AnalysisOverviewRow = Record<string, unknown> & {
  project_id: string;
};

export type CodeUsageStatsRow = Record<string, unknown> & {
  project_id: string;
};

export type UncodedSegmentRow = Record<string, unknown> & {
  project_id: string;
};

export type SegmentCodeAssignmentRow = {
  segment_id: string;
  code_id: string;
  is_quote?: boolean;
};

export type AnalysisCodeSummaryRow = {
  id: string;
  name: string;
  color: string;
  position: number;
  is_active: boolean;
};

export type SegmentPreviewRow = {
  id: string;
  document_id: string;
  selected_text: string;
  start_char: number;
  end_char: number;
};

export type CodingSegmentSourceRow = SegmentPreviewRow & {
  project_id: string;
  note: string;
};

export type DocumentPreviewRow = {
  id: string;
  title: string;
  document_type: string;
  participant_id: string | null;
};

export type ParticipantPreviewRow = {
  id: string;
  alias: string;
  display_name: string | null;
  attributes: Record<string, unknown>;
};

export type DashboardCodeRow = {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  definition: string | null;
  inclusion_criteria: string | null;
  exclusion_criteria: string | null;
  parent_code_id: string | null;
  color: string;
  position: number;
  is_active: boolean;
  metadata: Record<string, unknown>;
  revision: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  created_by: string | null;
  updated_by: string | null;
};

export type DashboardInsightRow = {
  id: string;
  project_id: string;
  title: string;
  summary: string;
  interpretation: string;
  insight_type: string;
  confidence: string;
  status: string;
  tags: string[];
  metadata: Record<string, unknown>;
  revision: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  created_by: string | null;
  updated_by: string | null;
};

const CODE_USAGE_STATS_SELECT = `*`;
const UNCODED_SEGMENTS_SELECT = `*`;
const CODING_SEGMENTS_SELECT = `
  id,
  project_id,
  document_id,
  note,
  selected_text,
  start_char,
  end_char
`;
const DASHBOARD_CODE_SELECT = `
  id,
  project_id,
  name,
  description,
  definition,
  inclusion_criteria,
  exclusion_criteria,
  parent_code_id,
  color,
  position,
  is_active,
  metadata,
  revision,
  created_at,
  updated_at,
  deleted_at,
  created_by,
  updated_by
`;
const DASHBOARD_INSIGHT_SELECT = `
  id,
  project_id,
  title,
  summary,
  interpretation,
  insight_type,
  confidence,
  status,
  tags,
  metadata,
  revision,
  created_at,
  updated_at,
  deleted_at,
  created_by,
  updated_by
`;

export class AnalysisOverviewRepo {
  constructor(private readonly db: ServerSupabase) {}

  async getOverview(projectId: string): Promise<AnalysisOverviewRow | null> {
    const { data, error } = await this.db.rpc(
      "get_project_analysis_overview",
      {
        input_project_id: projectId,
      }
    );

    if (error) throw error;

    return (data as AnalysisOverviewRow | null) ?? null;
  }

  async getCodeUsageStats(
    projectId: string,
    query: OverviewLimitOffsetQuery
  ): Promise<CodeUsageStatsRow[]> {
    const { data, error } = await this.db
      .from("project_code_usage_stats")
      .select(CODE_USAGE_STATS_SELECT)
      .eq("project_id", projectId)
      .range(query.offset, query.offset + query.limit - 1);

    if (error) throw error;

    return (data as CodeUsageStatsRow[] | null) ?? [];
  }

  async getUncodedSegments(
    projectId: string,
    query: OverviewLimitOffsetQuery
  ): Promise<UncodedSegmentRow[]> {
    const { data, error } = await this.db
      .from("project_uncoded_segments")
      .select(UNCODED_SEGMENTS_SELECT)
      .eq("project_id", projectId)
      .range(query.offset, query.offset + query.limit - 1);

    if (error) throw error;

    return ((data as UncodedSegmentRow[] | null) ?? []).map((segment) => {
      const publicSegment = { ...segment } as UncodedSegmentRow & {
        label?: unknown;
        segment_id?: string;
        id?: string;
      };
      delete publicSegment.label;
      // Keep the view's segment_id for compatibility, while exposing the
      // canonical resource id used by the other segment endpoints.
      if (!publicSegment.id && publicSegment.segment_id) {
        publicSegment.id = publicSegment.segment_id;
      }
      return publicSegment as UncodedSegmentRow;
    });
  }

  async listSegmentsForCoding(
    projectId: string
  ): Promise<CodingSegmentSourceRow[]> {
    const { data, error } = await this.db
      .from("project_document_segments")
      .select(CODING_SEGMENTS_SELECT)
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("document_id", { ascending: true })
      .order("start_char", { ascending: true })
      .range(0, 4999);

    if (error) throw error;

    return (data as CodingSegmentSourceRow[] | null) ?? [];
  }

  async listCodesForDashboard(
    projectId: string,
    query: OverviewLimitOffsetQuery
  ): Promise<DashboardCodeRow[]> {
    const { data, error } = await this.db
      .from("project_codes")
      .select(DASHBOARD_CODE_SELECT)
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("position", { ascending: true })
      .order("name", { ascending: true })
      .range(query.offset, query.offset + query.limit - 1);

    if (error) throw error;

    return (data as DashboardCodeRow[] | null) ?? [];
  }

  async getInsightsForDashboard(projectId: string): Promise<DashboardInsightRow[]> {
    const { data, error } = await this.db
      .from("project_insights")
      .select(DASHBOARD_INSIGHT_SELECT)
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .range(0, 199);

    if (error) throw error;

    return (data as DashboardInsightRow[] | null) ?? [];
  }

  async getSegmentCodeAssignments(
    projectId: string
  ): Promise<SegmentCodeAssignmentRow[]> {
    const { data, error } = await this.db
      .from("project_segment_codes")
      .select("segment_id, code_id, is_quote")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .range(0, 4999);

    if (error) throw error;

    return (data as SegmentCodeAssignmentRow[] | null) ?? [];
  }

  async getCodesByIds(
    projectId: string,
    codeIds: string[]
  ): Promise<AnalysisCodeSummaryRow[]> {
    if (!codeIds.length) return [];

    const { data, error } = await this.db
      .from("project_codes")
      .select("id, name, color, position, is_active")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .in("id", codeIds)
      .order("position", { ascending: true })
      .order("name", { ascending: true });

    if (error) throw error;

    return (data as AnalysisCodeSummaryRow[] | null) ?? [];
  }

  async getSegmentsByIds(
    projectId: string,
    segmentIds: string[]
  ): Promise<SegmentPreviewRow[]> {
    if (!segmentIds.length) return [];

    const { data, error } = await this.db
      .from("project_document_segments")
      .select("id, document_id, selected_text, start_char, end_char")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .in("id", segmentIds);

    if (error) throw error;

    return (data as SegmentPreviewRow[] | null) ?? [];
  }

  async getDocumentsByIds(
    projectId: string,
    documentIds: string[]
  ): Promise<DocumentPreviewRow[]> {
    if (!documentIds.length) return [];

    const { data, error } = await this.db
      .from("project_documents")
      .select("id, title, document_type, participant_id")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .in("id", documentIds);

    if (error) throw error;

    return (data as DocumentPreviewRow[] | null) ?? [];
  }

  async getParticipantsByIds(
    projectId: string,
    participantIds: string[]
  ): Promise<ParticipantPreviewRow[]> {
    if (!participantIds.length) return [];

    const { data, error } = await this.db
      .from("project_participants")
      .select("id, alias, display_name, attributes")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .in("id", participantIds);

    if (error) throw error;

    return (data as ParticipantPreviewRow[] | null) ?? [];
  }
}
