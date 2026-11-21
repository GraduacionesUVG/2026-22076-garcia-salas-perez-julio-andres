import {
  buildCodebookExportModel,
  buildDashboardExportModel,
  buildEvidenceByCodeExportModel,
  buildInsightsExportModel,
  buildProtocolExportModel,
  buildQuotesExportModel,
  renderExportBundleAsZip,
  renderExportAsDocx,
  renderExportAsMarkdown,
  renderExportAsPdf,
  type ExportCodeLike,
  type ExportCodeStatsLike,
  type ExportDashboardSnapshotLike,
  type ExportDocumentPatternsLike,
  type ExportInsightLike,
} from "@/src/modules/exports/project-exports.service";
import { extractDocxText, extractPdfText } from '../backend/binary-assertions';
import { PDFDocument } from 'pdf-lib';

describe('decoded export edge cases', () => {
  it('sorts shuffled siblings by position then name and supplies absent metadata and usage defaults', () => {
    const shuffled = [{ id: 'z', name: 'Zulu', position: 2 }, { id: 'b', name: 'Bravo', position: 1 }, { id: 'a', name: 'Alpha', position: 1 }];
    const model = buildCodebookExportModel({ projectName: 'Ordering', codes: shuffled });
    expect(model.sections[0].table?.rows).toEqual(['Alpha', 'Bravo', 'Zulu'].map(name => [name, 'Codigo raiz', '0 segmentos', '0 citas', 'Sin descripcion', 'Sin regla de uso']));
    expect(shuffled.map(code => code.name)).toEqual(['Zulu', 'Bravo', 'Alpha']);
  });
  it('fills document participant/type and insight visual metadata defaults', () => {
    const evidence = buildEvidenceByCodeExportModel({ projectName: 'Defaults', codes: [{ id: 'code', name: 'Memory' }], documentPatterns: { patterns: [{ code_id: 'code', documents: [{ segments: [{ selected_text: 'Evidence' }] }] }] } });
    expect(renderExportAsMarkdown(evidence)).toContain('Sin tipo'); expect(renderExportAsMarkdown(evidence)).toContain('Sin participante'); expect(renderExportAsMarkdown(evidence)).toContain('Documento');
    const insights = buildInsightsExportModel({ projectName: 'Defaults', insights: [{ title: 'Finding' }] });
    expect(insights.sections[0].table?.rows).toEqual([['Finding', 'draft', 'medium', '', '', '', 'Sin visual vinculado', '']]);
  });
  it('renders empty model sections as valid documents preserving title', async () => {
    const model = { title: 'Empty evidence', generatedAt: '2026-10-04', sections: [] };
    expect(await extractDocxText(await renderExportAsDocx(model))).toContain('Empty evidence');
    expect(await extractPdfText(await renderExportAsPdf(model))).toContain('Empty evidence');
  });
  it('preserves Unicode in DOCX and paginates long PDF paragraphs without dropping final evidence', async () => {
    const model = { title: 'Memoria comunitaria', generatedAt: '2026-10-04', sections: [{ title: 'Testimonios', paragraphs: ['Árbol 🌿 K’iche’ 日本語', ...Array.from({ length: 80 }, (_, index) => `Evidence ${index}: ${'community memory '.repeat(15)}`), 'Final evidence marker'] }] };
    const docx = await extractDocxText(await renderExportAsDocx(model)); expect(docx).toContain('Árbol 🌿 K’iche’ 日本語'); expect(docx).toContain('Final evidence marker');
    const pdf = await renderExportAsPdf({ ...model, sections: [{ ...model.sections[0], paragraphs: model.sections[0].paragraphs.slice(1) }] }); expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThan(2); const text = await extractPdfText(pdf); expect(text).toContain('Evidence 0'); expect(text).toContain('Evidence 79'); expect(text).toContain('Final evidence marker');
  });
  it('BUG: PDF should preserve non-WinAnsi research text instead of throwing', async () => {
    const model = { title: 'Memoria comunitaria', generatedAt: '2026-10-04', sections: [{ title: 'Testimonios', paragraphs: ['Árbol 🌿 K’iche’ 日本語'] }] };
    const text = await extractPdfText(await renderExportAsPdf(model));
    expect(text).toContain('Árbol 🌿 K’iche’ 日本語');
  });
  it('preserves Unicode in headings, metadata and table cells with subsetted fonts', async () => {
    const model = { title: '日本語 🌿', generatedAt: '2026-10-04', description: 'Memoria 日本語', sections: [{ title: '🌿 Evidencia', table: { headers: ['日本語'], rows: [['日本語 🌿'], ['Árbol K’iche’']] } }] };
    const pdf = await renderExportAsPdf(model);
    const text = await extractPdfText(pdf);
    for (const marker of ['日本語 🌿', 'Memoria 日本語', '🌿 Evidencia', 'Árbol K’iche’']) expect(text).toContain(marker);
    expect(pdf.length).toBeLessThan(100_000);
  });
});

const codes: ExportCodeLike[] = [
  {
    id: "code-parent",
    name: "Aprendizaje apoyado por familia",
    description: "Apoyos familiares para sostener el aprendizaje.",
    definition: "Usar cuando la familia acompana, explica o presta recursos.",
    parent_code_id: null,
    color: "#0f766e",
    position: 1,
  },
  {
    id: "code-child",
    name: "Mentoria entre pares",
    description: "Ayuda de companeros.",
    definition: "Usar cuando el aprendizaje ocurre entre estudiantes.",
    parent_code_id: "code-parent",
    color: "#0ea5e9",
    position: 2,
  },
];

const codeStats: ExportCodeStatsLike[] = [
  {
    code_id: "code-parent",
    name: "Aprendizaje apoyado por familia",
    coded_segments_count: 4,
    quotes_count: 2,
  },
  {
    code_id: "code-child",
    name: "Mentoria entre pares",
    coded_segments_count: 1,
    quotes_count: 1,
  },
];

const documentPatterns: ExportDocumentPatternsLike = {
  documents: [
    {
      id: "doc-1",
      title: "Entrevista demo",
      document_type: "interview",
      participant_label: "P01",
    },
  ],
  patterns: [
    {
      code_id: "code-parent",
      document_count: 1,
      total_segments: 2,
      quote_count: 1,
      documents: [
        {
          document_id: "doc-1",
          document_title: "Entrevista demo",
          document_type: "interview",
          participant_label: "P01",
          segment_count: 2,
          quote_count: 1,
          segments: [
            {
              segment_id: "segment-1",
              codes: [
                { id: "code-parent", name: "Aprendizaje apoyado por familia" },
              ],
              selected_text:
                "Al principio me daba pena preguntar, pero mi hermana me enseno paso a paso.",
              start_char: 20,
              end_char: 116,
              is_quote: true,
            },
            {
              segment_id: "segment-2",
              codes: [{ id: "code-parent", name: "Apoyo cotidiano" }],
              selected_text: "Mi familia me prestaba datos para estudiar.",
              start_char: 140,
              end_char: 182,
              is_quote: false,
            },
          ],
        },
      ],
    },
  ],
};

type ProtocolParams = Parameters<typeof buildProtocolExportModel>[0];
type ProtocolDelimitation = NonNullable<ProtocolParams["delimitation"]>;
type ProtocolDelimitationItem = NonNullable<
  ProtocolParams["delimitationItems"]
>[number];
type ProtocolResearchDesign = NonNullable<ProtocolParams["researchDesign"]>;
type ProtocolSpecificObjective = NonNullable<
  ProtocolParams["specificObjectives"]
>[number];
type ProtocolSample = NonNullable<ProtocolParams["sample"]>;
type ProtocolParticipant = NonNullable<ProtocolParams["participants"]>[number];
type ProtocolDocument = NonNullable<ProtocolParams["documents"]>[number];

describe("project export models", () => {
  it("builds a hierarchical codebook export with usage counts", () => {
    const model = buildCodebookExportModel({
      projectName: "Alfabetizacion digital",
      codes,
      codeStats,
      generatedAt: "2026-06-20T12:00:00.000Z",
    });

    const markdown = renderExportAsMarkdown(model);

    expect(model.title).toBe("Codebook - Alfabetizacion digital");
    expect(markdown).toContain("Documento academico");
    expect(markdown).toContain("Indice");
    expect(markdown).toContain("Aprendizaje apoyado por familia");
    expect(markdown).toContain("Mentoria entre pares");
    expect(markdown).toContain("4 segmentos");
    expect(markdown).toContain("1 citas");
    expect(markdown).toContain("Usar cuando la familia acompana");
  });

  it("groups evidence by code and document with segment text", () => {
    const model = buildEvidenceByCodeExportModel({
      projectName: "Alfabetizacion digital",
      codes,
      documentPatterns,
      generatedAt: "2026-06-20T12:00:00.000Z",
    });

    const markdown = renderExportAsMarkdown(model);

    expect(markdown).toContain("Evidencias por codigo");
    expect(markdown).toContain("Entrevista demo");
    expect(markdown).toContain("Aprendizaje apoyado por familia");
    expect(markdown).toContain("Mi familia me prestaba datos");
  });

  it("exports only textual quotes when building the quotes document", () => {
    const model = buildQuotesExportModel({
      projectName: "Alfabetizacion digital",
      codes,
      documentPatterns,
      generatedAt: "2026-06-20T12:00:00.000Z",
    });

    const markdown = renderExportAsMarkdown(model);

    expect(markdown).toContain("Citas textuales");
    expect(markdown).toContain("Al principio me daba pena preguntar");
    expect(markdown).not.toContain("Mi familia me prestaba datos");
  });

  it("builds an insights log export with status, tags and linked evidence summary", () => {
    const model = buildInsightsExportModel({
      projectName: "Alfabetizacion digital",
      insights: [
        {
          id: "insight-1",
          title: "La confianza depende del apoyo cercano",
          summary: "El apoyo familiar aparece como condicion de avance.",
          interpretation: "No es solo acceso tecnologico, es acompanamiento.",
          status: "confirmed",
          confidence: "high",
          tags: ["familia", "confianza"],
          created_at: "2026-06-19T10:00:00.000Z",
          updated_at: "2026-06-20T10:00:00.000Z",
          metadata: { source_visual_title: "Matriz de co-ocurrencia" },
        },
      ] satisfies ExportInsightLike[],
      generatedAt: "2026-06-20T12:00:00.000Z",
    });

    const markdown = renderExportAsMarkdown(model);

    expect(markdown).toContain("Bitacora de hallazgos");
    expect(markdown).toContain("confirmed");
    expect(markdown).toContain("familia, confianza");
    expect(markdown).toContain("Matriz de co-ocurrencia");
  });

  it("builds a protocol export that ends at sample and excludes corpus evidence", () => {
    const model = buildProtocolExportModel({
      projectName: "Alfabetizacion digital",
      delimitation: {
        topic: "Uso del telefono para estudiar",
        context_place: "Guatemala",
        population: "Estudiantes adultos",
        time_period: "2026",
        resources: "Entrevistas y observacion",
      } satisfies ProtocolDelimitation,
      delimitationItems: [
        { kind: "include", text: "Experiencias de aprendizaje digital" },
        { kind: "exclude", text: "Evaluacion de plataformas institucionales" },
      ] satisfies ProtocolDelimitationItem[],
      researchDesign: {
        research_question:
          "Como usan el telefono estudiantes adultos para sostener su aprendizaje?",
        general_objective:
          "Comprender las practicas de aprendizaje movil en estudiantes adultos.",
      } satisfies ProtocolResearchDesign,
      specificObjectives: [
        { text: "Identificar barreras de acceso.", position: 0 },
      ] satisfies ProtocolSpecificObjective[],
      sample: {
        config: {
          main_approach_code: "qualitative",
          scope_code: "exploratory",
          field_phase: "Trabajo de campo inicial",
          target_sample_size: 12,
          sample_size_rationale: "Saturacion tematica esperada.",
        },
        collection_techniques: [
          { technique_code: "interview", custom_label: null, is_custom: false },
        ],
      } satisfies ProtocolSample,
      participants: [
        { alias: "P01", display_name: "Participante 1", status: "active" },
      ] satisfies ProtocolParticipant[],
      documents: [
        { title: "Entrevista demo", document_type: "interview", word_count: 500 },
      ] satisfies ProtocolDocument[],
      generatedAt: "2026-06-20T12:00:00.000Z",
    });

    const markdown = renderExportAsMarkdown(model);

    expect(markdown).toContain("Protocolo de investigacion");
    expect(markdown).toContain("Alcance del protocolo");
    expect(markdown).toContain("Uso del telefono para estudiar");
    expect(markdown).toContain("Como usan el telefono");
    expect(markdown).toContain("12");
    expect(markdown).not.toContain("## Participantes");
    expect(markdown).not.toContain("## Corpus");
    expect(markdown).not.toContain("P01");
    expect(markdown).not.toContain("Entrevista demo");
  });

  it("builds a dashboard data export from the analysis snapshot", () => {
    const model = buildDashboardExportModel({
      projectName: "Alfabetizacion digital",
      snapshot: {
        overview: {
          documents_count: 4,
          segments_count: 18,
          codes_count: 8,
          coded_segments_count: 16,
          memos_count: 4,
          insights_count: 2,
        },
        stats: codeStats,
        relationships: [
          {
            source_code_id: "code-parent",
            target_code_id: "code-child",
            shared_segment_count: 3,
          },
        ],
        documentPatterns,
      } satisfies ExportDashboardSnapshotLike,
      codes,
      generatedAt: "2026-06-20T12:00:00.000Z",
    });

    const markdown = renderExportAsMarkdown(model);

    expect(markdown).toContain("Datos del dashboard");
    expect(markdown).toContain("Segmentos codificados");
    expect(markdown).toContain("Aprendizaje apoyado por familia");
    expect(markdown).toContain("Mentoria entre pares");
    expect(markdown).toContain("3");
  });
});

describe("project export renderers", () => {
  it("renders real docx and pdf buffers from the same export model", async () => {
    const model = buildCodebookExportModel({
      projectName: "Alfabetizacion digital",
      codes,
      codeStats,
      generatedAt: "2026-06-20T12:00:00.000Z",
    });

    const [docxBuffer, pdfBuffer] = await Promise.all([
      renderExportAsDocx(model),
      renderExportAsPdf(model),
    ]);

    expect(Buffer.isBuffer(docxBuffer)).toBe(true);
    expect(docxBuffer.subarray(0, 2).toString("utf8")).toBe("PK");
    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    expect(pdfBuffer.subarray(0, 4).toString("utf8")).toBe("%PDF");
  });

  it("renders a zip bundle with multiple export documents", async () => {
    const models = [
      buildCodebookExportModel({
        projectName: "Alfabetizacion digital",
        codes,
        codeStats,
        generatedAt: "2026-06-20T12:00:00.000Z",
      }),
      buildQuotesExportModel({
        projectName: "Alfabetizacion digital",
        codes,
        documentPatterns,
        generatedAt: "2026-06-20T12:00:00.000Z",
      }),
    ];

    const zipBuffer = await renderExportBundleAsZip(models);

    expect(Buffer.isBuffer(zipBuffer)).toBe(true);
    expect(zipBuffer.subarray(0, 2).toString("utf8")).toBe("PK");
    expect(zipBuffer.length).toBeGreaterThan(1000);
  });
});
