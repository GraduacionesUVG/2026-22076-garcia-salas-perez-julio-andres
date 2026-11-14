import type { ServerSupabase } from "@/src/modules/auth/auth.guard";
import type { ProjectWorkflowSource } from "./project-workflow.types";

export class ProjectWorkflowRepo {
  constructor(private readonly db: ServerSupabase) {}

  async getSource(projectId: string): Promise<ProjectWorkflowSource> {
    const delimitationPromise = this.db
      .from("project_delimitation")
      .select("topic, context_place, population, time_period, resources")
      .eq("project_id", projectId)
      .maybeSingle();
    const designPromise = this.db
      .from("project_research_design")
      .select("research_question, general_objective")
      .eq("project_id", projectId)
      .maybeSingle();
    const samplePromise = this.db
      .from("project_sample_config")
      .select(
        "main_approach_code, scope_code, field_phase, target_sample_size, sample_size_rationale"
      )
      .eq("project_id", projectId)
      .maybeSingle();
    const delimitationItemsPromise = this.db
      .from("project_delimitation_items")
      .select("kind")
      .eq("project_id", projectId);
    const objectivesPromise = this.db
      .from("project_specific_objectives")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId);
    const techniquesPromise = this.db
      .from("project_sample_collection_techniques")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId);
    const documentsPromise = this.db
      .from("project_documents")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .is("deleted_at", null);
    const segmentsPromise = this.db
      .from("project_document_segments")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .is("deleted_at", null);
    const codesPromise = this.db
      .from("project_codes")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .is("deleted_at", null);
    const assignmentsPromise = this.db
      .from("project_segment_codes")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .is("deleted_at", null);
    const memosPromise = this.db
      .from("project_memos")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .is("deleted_at", null);
    const insightsPromise = this.db
      .from("project_insights")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .is("deleted_at", null);
    const confirmedInsightsPromise = this.db
      .from("project_insights")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("status", "confirmed")
      .is("deleted_at", null);

    const results = await Promise.all([
      delimitationPromise,
      designPromise,
      samplePromise,
      delimitationItemsPromise,
      objectivesPromise,
      techniquesPromise,
      documentsPromise,
      segmentsPromise,
      codesPromise,
      assignmentsPromise,
      memosPromise,
      insightsPromise,
      confirmedInsightsPromise,
    ]);

    const failed = results.find((result) => result.error);
    if (failed?.error) throw failed.error;

    const delimitationItems = results[3].data ?? [];

    return {
      delimitation: results[0].data,
      design: results[1].data,
      sample: results[2].data,
      delimitationItems: delimitationItems.length,
      delimitationIncludeItems: delimitationItems.filter(
        (item) => item.kind === "include"
      ).length,
      delimitationExcludeItems: delimitationItems.filter(
        (item) => item.kind === "exclude"
      ).length,
      specificObjectives: results[4].count ?? 0,
      collectionTechniques: results[5].count ?? 0,
      documents: results[6].count ?? 0,
      segments: results[7].count ?? 0,
      codes: results[8].count ?? 0,
      assignments: results[9].count ?? 0,
      memos: results[10].count ?? 0,
      insights: results[11].count ?? 0,
      confirmedInsights: results[12].count ?? 0,
    };
  }
}
