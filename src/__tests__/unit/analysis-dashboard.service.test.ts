import { AnalysisOverviewService } from "@/src/modules/analysis/analysis-overview.service";

function makeRepo(overrides: Record<string, unknown> = {}) {
  return {
    getOverview: jest.fn().mockResolvedValue({ project_id: "project-1" }),
    getCodeUsageStats: jest.fn().mockResolvedValue([]),
    getUncodedSegments: jest.fn().mockResolvedValue([]),
    listSegmentsForCoding: jest.fn().mockResolvedValue([
      {
        id: "segment-1",
        project_id: "project-1",
        document_id: "document-1",
        note: "Apoyo familiar",
        selected_text: "Mi hermana me ayudó a aprender.",
        start_char: 0,
        end_char: 32,
      },
      {
        id: "segment-2",
        project_id: "project-1",
        document_id: "document-2",
        note: "",
        selected_text: "Ahora tengo confianza para usar el teléfono.",
        start_char: 10,
        end_char: 54,
      },
    ]),
    getInsightsForDashboard: jest.fn().mockResolvedValue([{ id: "insight-1" }]),
    listCodesForDashboard: jest.fn().mockResolvedValue([]),
    getSegmentCodeAssignments: jest.fn().mockResolvedValue([
      { segment_id: "segment-1", code_id: "code-1", is_quote: false },
      { segment_id: "segment-1", code_id: "code-2", is_quote: true },
      { segment_id: "segment-2", code_id: "code-1", is_quote: false },
    ]),
    getSegmentsByIds: jest.fn().mockResolvedValue([
      {
        id: "segment-1",
        document_id: "document-1",
        selected_text: "Texto 1",
        start_char: 0,
        end_char: 8,
      },
      {
        id: "segment-2",
        document_id: "document-2",
        selected_text: "Texto 2",
        start_char: 10,
        end_char: 18,
      },
    ]),
    getDocumentsByIds: jest.fn().mockResolvedValue([
      {
        id: "document-1",
        title: "Documento 1",
        document_type: "interview",
        participant_id: null,
      },
      {
        id: "document-2",
        title: "Documento 2",
        document_type: "diary",
        participant_id: null,
      },
    ]),
    getParticipantsByIds: jest.fn().mockResolvedValue([]),
    getCodesByIds: jest.fn().mockResolvedValue([
      {
        id: "code-1",
        name: "Confianza",
        color: "#2563eb",
        position: 1,
        is_active: true,
      },
      {
        id: "code-2",
        name: "Apoyo familiar",
        color: "#0f766e",
        position: 2,
        is_active: true,
      },
    ]),
    ...overrides,
  };
}

describe("dashboard context fallbacks", () => {
  it("adds pending document and participant context in the existing batch without changing pattern documents", async () => {
    const pending = { project_id: "project-1", id: "pending-1", document_id: "pending-document", selected_text: "miedo.", start_char: 7, end_char: 13 };
    const repo = makeRepo({
      getUncodedSegments: jest.fn().mockResolvedValue([pending, { ...pending, id: "pending-2" }]),
      getDocumentsByIds: jest.fn().mockResolvedValue([
        { id: "document-1", title: "Documento 1", document_type: "interview", participant_id: null },
        { id: "document-2", title: "Documento 2", document_type: "diary", participant_id: null },
        { id: "pending-document", title: "Entrevista de aprendizaje", document_type: "interview", participant_id: "participant-pending" },
      ]),
      getParticipantsByIds: jest.fn().mockResolvedValue([{ id: "participant-pending", alias: "P03", display_name: "María José", attributes: {} }]),
    });
    const snapshot = await new AnalysisOverviewService(repo as never).getDashboardSnapshot("project-1");
    expect(snapshot.uncodedSegments).toEqual([
      { ...pending, document_title: "Entrevista de aprendizaje", document_type: "interview", participant_id: "participant-pending", participant_label: "María José" },
      { ...pending, id: "pending-2", document_title: "Entrevista de aprendizaje", document_type: "interview", participant_id: "participant-pending", participant_label: "María José" },
    ]);
    expect(repo.getDocumentsByIds.mock.calls).toEqual([["project-1", ["document-1", "document-2", "pending-document"]]]);
    expect(repo.getParticipantsByIds.mock.calls).toEqual([["project-1", ["participant-pending"]]]);
    expect(snapshot.documentPatterns.documents.map(document => document.id)).toEqual(["document-1", "document-2"]);
  });

  it("resolves standalone pending context in batches and keeps missing resources readable", async () => {
    const repo = makeRepo({ getUncodedSegments: jest.fn().mockResolvedValue([
      { project_id: "project-1", id: "pending-1", document_id: "document-1", selected_text: "miedo." },
      { project_id: "project-1", id: "pending-2", document_id: "missing-document", selected_text: "Otra evidencia" },
    ]) });
    const rows = await new AnalysisOverviewService(repo as never).getUncodedSegments("project-1", { limit: 8, offset: 0 });
    expect(rows[0]).toMatchObject({ id: "pending-1", document_title: "Documento 1", participant_label: "Sin participante" });
    expect(rows[1]).toMatchObject({ id: "pending-2", document_id: "missing-document", document_title: "Documento no disponible", participant_label: "Sin participante" });
    expect(repo.getDocumentsByIds.mock.calls).toEqual([["project-1", ["document-1", "missing-document"]]]);
  });

  it("does not request context for an empty pending page", async () => {
    const repo = makeRepo();
    expect(await new AnalysisOverviewService(repo as never).getUncodedSegments("project-1", { limit: 8, offset: 0 })).toEqual([]);
    expect(repo.getDocumentsByIds).not.toHaveBeenCalled();
    expect(repo.getParticipantsByIds).not.toHaveBeenCalled();
  });
  it.each([
    { attributes: { sample_group: "  ", participant_type: " Interview " }, key: "Interview", attribute: "participant_type", label: "Interview" },
    { attributes: { community: " Community A " }, key: "Community A", attribute: "community", label: "Community A" },
    { attributes: { age_range: " 18-25 " }, key: "18-25", attribute: "age_range", label: "18-25" },
    { attributes: { gender_identity: " Woman " }, key: "Woman", attribute: "gender_identity", label: "Woman" },
    { attributes: {}, key: "participant-distinct", attribute: "participant", label: "Alias-distinct" },
  ])("uses $attribute fallback after blank higher-priority attributes", async ({ attributes, key, attribute, label }) => {
    const repo = makeRepo({
      getSegmentCodeAssignments: jest.fn().mockResolvedValue([{ segment_id: "segment-1", code_id: "code-1" }]),
      getDocumentsByIds: jest.fn().mockResolvedValue([{ id: "document-1", title: "Evidence", document_type: "interview", participant_id: "participant-distinct" }]),
      getParticipantsByIds: jest.fn().mockResolvedValue([{ id: "participant-distinct", alias: "Alias-distinct", display_name: null, attributes }]),
    });
    const snapshot = await new AnalysisOverviewService(repo as never).getDashboardSnapshot("project-1");
    expect(snapshot.groupComparisons.groups).toEqual([{ key, label, attribute, participant_count: 1, document_count: 1, segment_count: 1 }]);
    expect(snapshot.groupComparisons.rows).toEqual([{ code_id: "code-1", code_name: "Codigo", color: "#0f766e", total_segments: 1, counts: { [key]: 1 } }]);
  });
  it("keeps equal-count document patterns in source order and honors pagination", async () => {
    const repo = makeRepo({ getSegmentCodeAssignments: jest.fn().mockResolvedValue([
      { segment_id: "segment-2", code_id: "code-2" },
      { segment_id: "segment-1", code_id: "code-1" },
    ]) });
    const service = new AnalysisOverviewService(repo as never);
    expect((await service.getDocumentPatterns("project-1", { limit: 10, offset: 0 })).patterns.map(p => p.code_id)).toEqual(["code-2", "code-1"]);
    expect((await service.getDocumentPatterns("project-1", { limit: 1, offset: 1 })).patterns.map(p => p.code_id)).toEqual(["code-1"]);
  });
});

describe("AnalysisOverviewService dashboard snapshot", () => {
  it("builds dashboard relationships and document patterns from one assignment read", async () => {
    const repo = makeRepo();
    const service = new AnalysisOverviewService(repo as never);

    const snapshot = await service.getDashboardSnapshot("project-1");

    expect(repo.getSegmentCodeAssignments).toHaveBeenCalledTimes(1);
    expect(snapshot.insights).toEqual([{ id: "insight-1" }]);
    expect(snapshot.relationships).toHaveLength(1);
    expect(snapshot.relationships[0]).toMatchObject({
      source_code_id: "code-1",
      target_code_id: "code-2",
      shared_segment_count: 1,
    });
    expect(snapshot.documentPatterns.patterns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code_id: "code-1",
          document_count: 2,
          total_segments: 2,
        }),
      ])
    );
  });

  it("derives dashboard code stats from the snapshot assignments without reading the stats view", async () => {
    const repo = makeRepo({
      getCodeUsageStats: jest.fn().mockRejectedValue(new Error("stats view used")),
      listCodesForDashboard: jest.fn().mockResolvedValue([
        {
          id: "code-1",
          project_id: "project-1",
          name: "Confianza",
          description: "Momentos de seguridad",
          definition: "Confianza digital progresiva",
          parent_code_id: null,
          color: "#2563eb",
          position: 1,
        },
        {
          id: "code-2",
          project_id: "project-1",
          name: "Apoyo familiar",
          description: "Acompañamiento familiar",
          definition: "Apoyo en casa",
          parent_code_id: null,
          color: "#0f766e",
          position: 2,
        },
      ]),
    });
    const service = new AnalysisOverviewService(repo as never);

    const snapshot = await service.getDashboardSnapshot("project-1");

    expect(repo.getCodeUsageStats).not.toHaveBeenCalled();
    expect(snapshot.stats).toEqual([
      expect.objectContaining({
        code_id: "code-1",
        coded_segments_count: 2,
        quotes_count: 0,
      }),
      expect.objectContaining({
        code_id: "code-2",
        coded_segments_count: 1,
        quotes_count: 1,
      }),
    ]);
  });

  it("builds group comparisons from participant attributes instead of document type fallback", async () => {
    const repo = makeRepo({
      listCodesForDashboard: jest.fn().mockResolvedValue([
        {
          id: "code-1",
          project_id: "project-1",
          name: "Confianza",
          description: null,
          definition: null,
          parent_code_id: null,
          color: "#2563eb",
          position: 1,
        },
      ]),
      getDocumentsByIds: jest.fn().mockResolvedValue([
        {
          id: "document-1",
          title: "Documento 1",
          document_type: "interview",
          participant_id: "participant-1",
        },
        {
          id: "document-2",
          title: "Documento 2",
          document_type: "diary",
          participant_id: "participant-2",
        },
      ]),
      getParticipantsByIds: jest.fn().mockResolvedValue([
        {
          id: "participant-1",
          alias: "P01",
          display_name: null,
          attributes: {
            sample_group: "Mujeres adultas",
            participant_type: "Entrevista",
          },
        },
        {
          id: "participant-2",
          alias: "P02",
          display_name: null,
          attributes: {
            sample_group: "Jovenes",
            participant_type: "Diario",
          },
        },
      ]),
    });
    const service = new AnalysisOverviewService(repo as never);

    const snapshot = await service.getDashboardSnapshot("project-1");

    expect(snapshot.groupComparisons).toMatchObject({
      attribute: "sample_group",
      groups: [
        expect.objectContaining({ key: "Mujeres adultas", label: "Mujeres adultas" }),
        expect.objectContaining({ key: "Jovenes", label: "Jovenes" }),
      ],
    });
    expect(snapshot.groupComparisons.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code_id: "code-1",
          counts: {
            "Mujeres adultas": 1,
            Jovenes: 1,
          },
        }),
      ])
    );
  });
});

describe("AnalysisOverviewService coding queue", () => {
  it("joins context, counts coding state, filters, and paginates segments", async () => {
    const repo = makeRepo({
      getSegmentCodeAssignments: jest.fn().mockResolvedValue([
        { segment_id: "segment-1", code_id: "code-1", is_quote: false },
        { segment_id: "segment-1", code_id: "code-2", is_quote: true },
      ]),
      getDocumentsByIds: jest.fn().mockResolvedValue([
        {
          id: "document-1",
          title: "Entrevista P01",
          document_type: "interview",
          participant_id: "participant-1",
        },
        {
          id: "document-2",
          title: "Entrevista P02",
          document_type: "interview",
          participant_id: "participant-2",
        },
      ]),
      getParticipantsByIds: jest.fn().mockResolvedValue([
        {
          id: "participant-1",
          alias: "P01",
          display_name: "Ana",
          attributes: {},
        },
        {
          id: "participant-2",
          alias: "P02",
          display_name: null,
          attributes: {},
        },
      ]),
    });
    const service = new AnalysisOverviewService(repo as never);

    const result = await service.getCodingSegments("project-1", {
      status: "uncoded",
      search: "confianza",
      document_id: undefined,
      limit: 20,
      offset: 0,
    });

    expect(result.counts).toEqual({ all: 2, coded: 1, uncoded: 1 });
    expect(result.total).toBe(1);
    expect(result.segments).toEqual([
      expect.objectContaining({
        id: "segment-2",
        document_title: "Entrevista P02",
        participant_label: "P02",
        code_count: 0,
        code_ids: [],
        is_coded: false,
      }),
    ]);
  });

  it("returns coded segments with unique assigned code ids", async () => {
    const repo = makeRepo({
      getSegmentCodeAssignments: jest.fn().mockResolvedValue([
        { segment_id: "segment-1", code_id: "code-1", is_quote: false },
        { segment_id: "segment-1", code_id: "code-2", is_quote: true },
        { segment_id: "segment-1", code_id: "code-1", is_quote: false },
      ]),
    });
    const service = new AnalysisOverviewService(repo as never);

    const result = await service.getCodingSegments("project-1", {
      status: "coded",
      search: undefined,
      document_id: undefined,
      limit: 20,
      offset: 0,
    });

    expect(result.segments).toEqual([
      expect.objectContaining({
        id: "segment-1",
        code_count: 2,
        code_ids: ["code-1", "code-2"],
        codes: [
          expect.objectContaining({ id: "code-1", name: "Confianza" }),
          expect.objectContaining({ id: "code-2", name: "Apoyo familiar" }),
        ],
        is_coded: true,
      }),
    ]);
  });

  it("searches coded segments by assigned code name", async () => {
    const repo = makeRepo();
    const service = new AnalysisOverviewService(repo as never);

    const result = await service.getCodingSegments("project-1", {
      status: "coded",
      search: "apoyo familiar",
      document_id: undefined,
      limit: 20,
      offset: 0,
    });

    expect(result.segments).toEqual([
      expect.objectContaining({
        id: "segment-1",
        codes: expect.arrayContaining([
          expect.objectContaining({ name: "Apoyo familiar" }),
        ]),
      }),
    ]);
  });

  it("keeps a segment coded when an assigned code metadata row is unavailable", async () => {
    const repo = makeRepo({
      getSegmentCodeAssignments: jest.fn().mockResolvedValue([
        { segment_id: "segment-1", code_id: "code-1", is_quote: false },
        { segment_id: "segment-1", code_id: "code-2", is_quote: true },
      ]),
      getCodesByIds: jest.fn().mockResolvedValue([]),
    });
    const service = new AnalysisOverviewService(repo as never);

    const result = await service.getCodingSegments("project-1", {
      status: "all",
      search: undefined,
      document_id: undefined,
      limit: 20,
      offset: 0,
    });

    expect(result.segments[0]).toMatchObject({
      code_ids: ["code-1", "code-2"],
      code_count: 2,
      is_coded: true,
      codes: [],
    });
    expect(result.counts).toEqual({ all: 2, coded: 1, uncoded: 1 });
  });
});
