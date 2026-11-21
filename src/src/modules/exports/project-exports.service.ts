import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import JSZip from "jszip";
import {
  PDFDocument, PDFName, StandardFonts, beginText, endText, popGraphicsState,
  pushGraphicsState, rgb, setFillingColor, setFontAndSize, setTextMatrix, showText,
  type PDFFont,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

type ExportTable = {
  headers: string[];
  rows: string[][];
};

type ExportSection = {
  title: string;
  paragraphs?: string[];
  table?: ExportTable;
  sections?: ExportSection[];
};

export type ProjectExportModel = {
  title: string;
  description?: string;
  documentKind?: string;
  projectName?: string;
  generatedAt: string;
  sections: ExportSection[];
};

export type ExportCodeLike = {
  id: string;
  name: string;
  description?: string | null;
  definition?: string | null;
  parent_code_id?: string | null;
  color?: string | null;
  position?: number | null;
};

export type ExportCodeStatsLike = {
  [key: string]: unknown;
  code_id?: string;
  id?: string;
  name?: string;
  coded_segments_count?: number;
  segment_count?: number;
  usage_count?: number;
  count?: number;
  quotes_count?: number;
};

export type ExportSegmentLike = {
  segment_id?: string;
  code_ids?: string[];
  codes?: Array<{ id?: string; name?: string; color?: string | null }>;
  selected_text?: string;
  start_char?: number;
  end_char?: number;
  is_quote?: boolean;
};

export type ExportDocumentPatternDocumentLike = {
  document_id?: string;
  document_title?: string;
  document_type?: string;
  participant_label?: string;
  segment_count?: number;
  quote_count?: number;
  segments?: ExportSegmentLike[];
};

export type ExportDocumentPatternLike = {
  code_id: string;
  document_count?: number;
  total_segments?: number;
  quote_count?: number;
  documents?: ExportDocumentPatternDocumentLike[];
};

export type ExportDocumentPatternsLike = {
  documents?: Record<string, unknown>[];
  patterns?: ExportDocumentPatternLike[];
};

export type ExportInsightLike = {
  id?: string;
  title: string;
  summary?: string | null;
  interpretation?: string | null;
  status?: string | null;
  confidence?: string | null;
  tags?: string[] | null;
  created_at?: string | null;
  updated_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type ExportRelationshipLike = {
  source_code_id?: string;
  target_code_id?: string;
  shared_segment_count?: number;
};

export type ExportDashboardOverviewLike = Record<string, unknown>;

export type ExportDashboardSnapshotLike = {
  overview?: ExportDashboardOverviewLike | null;
  stats?: ExportCodeStatsLike[];
  relationships?: ExportRelationshipLike[];
  documentPatterns?: ExportDocumentPatternsLike;
};

function text(value: unknown, fallback = "") {
  const normalized = String(value ?? "").trim();
  return normalized.length ? normalized : fallback;
}

function academicKind(model: ProjectExportModel) {
  return model.documentKind ?? "Documento academico";
}

function generatedDate(value: string) {
  try {
    return new Intl.DateTimeFormat("es-GT", {
      year: "numeric",
      month: "long",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function countCodeUsage(stat?: ExportCodeStatsLike) {
  return Number(
    stat?.coded_segments_count ??
      stat?.segment_count ??
      stat?.usage_count ??
      stat?.count ??
      0
  );
}

function statsMap(codeStats: ExportCodeStatsLike[] = []) {
  return new Map(codeStats.map((item) => [item.code_id ?? item.id, item]));
}

function codeMap(codes: ExportCodeLike[] = []) {
  return new Map(codes.map((code) => [code.id, code]));
}

function sortCodes(codes: ExportCodeLike[]) {
  return [...codes].sort(
    (a, b) =>
      Number(a.position ?? 0) - Number(b.position ?? 0) ||
      a.name.localeCompare(b.name)
  );
}

function buildCodeRows({
  codes,
  codeStats,
}: {
  codes: ExportCodeLike[];
  codeStats?: ExportCodeStatsLike[];
}) {
  const byParent = new Map<string, ExportCodeLike[]>();
  const byStats = statsMap(codeStats);

  codes.forEach((code) => {
    const parentId = code.parent_code_id || "__root";
    byParent.set(parentId, [...(byParent.get(parentId) ?? []), code]);
  });

  const rows: string[][] = [];

  function visit(parentId: string, level = 0) {
    for (const code of sortCodes(byParent.get(parentId) ?? [])) {
      const stat = byStats.get(code.id);
      rows.push([
        `${"  ".repeat(level)}${code.name}`,
        code.parent_code_id ? "Subcodigo" : "Codigo raiz",
        `${countCodeUsage(stat)} segmentos`,
        `${Number(stat?.quotes_count ?? 0)} citas`,
        text(code.description, "Sin descripcion"),
        text(code.definition, "Sin regla de uso"),
      ]);
      visit(code.id, level + 1);
    }
  }

  visit("__root");
  return rows;
}

export function buildCodebookExportModel(params: {
  projectName: string;
  codes: ExportCodeLike[];
  codeStats?: ExportCodeStatsLike[];
  generatedAt?: string;
}): ProjectExportModel {
  return {
    title: `Codebook - ${params.projectName}`,
    documentKind: "Documento academico - codebook",
    projectName: params.projectName,
    description: "Codigos, jerarquia, definiciones y conteos de evidencia.",
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    sections: [
      {
        title: "Codebook jerarquico",
        table: {
          headers: [
            "Codigo",
            "Nivel",
            "Segmentos",
            "Citas",
            "Descripcion",
            "Regla de uso",
          ],
          rows: buildCodeRows(params),
        },
      },
    ],
  };
}

function getCodeName(codesById: Map<string, ExportCodeLike>, codeId: string) {
  return codesById.get(codeId)?.name ?? "Codigo sin nombre";
}

function segmentCodeNames(segment: ExportSegmentLike, fallback: string) {
  const names = (segment.codes ?? [])
    .map((code) => text(code?.name))
    .filter(Boolean);

  return names.length ? names.join(", ") : fallback;
}

function evidenceRows(params: {
  codes: ExportCodeLike[];
  documentPatterns: ExportDocumentPatternsLike;
  onlyQuotes?: boolean;
}) {
  const codesById = codeMap(params.codes);
  const rows: string[][] = [];

  for (const pattern of params.documentPatterns.patterns ?? []) {
    const codeName = getCodeName(codesById, pattern.code_id);

    for (const document of pattern.documents ?? []) {
      for (const segment of document.segments ?? []) {
        if (params.onlyQuotes && !segment.is_quote) continue;

        rows.push([
          codeName,
          text(document.document_title, "Documento"),
          text(document.document_type, "Sin tipo"),
          text(document.participant_label, "Sin participante"),
          segmentCodeNames(segment, codeName),
          `${segment.start_char ?? ""} - ${segment.end_char ?? ""}`.trim(),
          segment.is_quote ? "Cita textual" : "Segmento",
          text(segment.selected_text),
        ]);
      }
    }
  }

  return rows;
}

export function buildEvidenceByCodeExportModel(params: {
  projectName: string;
  codes: ExportCodeLike[];
  documentPatterns: ExportDocumentPatternsLike;
  generatedAt?: string;
}): ProjectExportModel {
  return {
    title: `Evidencias por codigo - ${params.projectName}`,
    documentKind: "Documento academico - matriz de evidencia",
    projectName: params.projectName,
    description: "Segmentos agrupados por codigo, documento y participante.",
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    sections: [
      {
        title: "Evidencias por codigo",
        table: {
          headers: [
            "Codigo",
            "Documento",
            "Tipo",
            "Participante",
            "Códigos",
            "Rango",
            "Clase",
            "Texto",
          ],
          rows: evidenceRows(params),
        },
      },
    ],
  };
}

export function buildQuotesExportModel(params: {
  projectName: string;
  codes: ExportCodeLike[];
  documentPatterns: ExportDocumentPatternsLike;
  generatedAt?: string;
}): ProjectExportModel {
  return {
    title: `Citas textuales - ${params.projectName}`,
    documentKind: "Documento academico - citas textuales",
    projectName: params.projectName,
    description: "Citas marcadas como evidencia literal para el reporte.",
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    sections: [
      {
        title: "Citas textuales",
        table: {
          headers: [
            "Codigo",
            "Documento",
            "Tipo",
            "Participante",
            "Códigos",
            "Rango",
            "Clase",
            "Texto",
          ],
          rows: evidenceRows({ ...params, onlyQuotes: true }),
        },
      },
    ],
  };
}

export function buildInsightsExportModel(params: {
  projectName: string;
  insights: ExportInsightLike[];
  generatedAt?: string;
}): ProjectExportModel {
  return {
    title: `Bitacora de hallazgos - ${params.projectName}`,
    documentKind: "Documento academico - bitacora analitica",
    projectName: params.projectName,
    description: "Hallazgos, estado, etiquetas y trazabilidad visible.",
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    sections: [
      {
        title: "Bitacora de hallazgos",
        table: {
          headers: [
            "Hallazgo",
            "Estado",
            "Confianza",
            "Tags",
            "Resumen",
            "Interpretacion",
            "Origen visual",
            "Actualizado",
          ],
          rows: params.insights.map((insight) => [
            insight.title,
            text(insight.status, "draft"),
            text(insight.confidence, "medium"),
            (insight.tags ?? []).join(", "),
            text(insight.summary),
            text(insight.interpretation),
            text(insight.metadata?.source_visual_title, "Sin visual vinculado"),
            text(insight.updated_at ?? insight.created_at),
          ]),
        },
      },
    ],
  };
}

export function buildProtocolExportModel(params: {
  projectName: string;
  delimitation?: Record<string, unknown> | null;
  delimitationItems?: Array<{ kind: string; text: string }>;
  researchDesign?: Record<string, unknown> | null;
  specificObjectives?: Array<{ text: string; position?: number | null }>;
  sample?: {
    config?: Record<string, unknown>;
    collection_techniques?: Array<Record<string, unknown>>;
  } | null;
  participants?: Array<Record<string, unknown>>;
  documents?: Array<Record<string, unknown>>;
  generatedAt?: string;
}): ProjectExportModel {
  const delimitation = params.delimitation ?? {};
  const researchDesign = params.researchDesign ?? {};
  const sampleConfig = params.sample?.config ?? {};
  const includeItems = (params.delimitationItems ?? []).filter(
    (item) => item.kind === "include"
  );
  const excludeItems = (params.delimitationItems ?? []).filter(
    (item) => item.kind === "exclude"
  );

  return {
    title: `Protocolo de investigacion - ${params.projectName}`,
    documentKind: "Documento academico - protocolo metodologico",
    projectName: params.projectName,
    description:
      "Protocolo metodologico hasta la fase de muestra. No incluye corpus, codificacion ni evidencia analitica.",
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    sections: [
      {
        title: "Alcance del protocolo",
        paragraphs: [
          "Este documento consolida la preparacion metodologica del proyecto: delimitacion, diseno de investigacion y muestra. El corpus, la codificacion, las citas y los hallazgos se exportan en documentos separados para mantener trazabilidad entre protocolo y analisis.",
        ],
      },
      {
        title: "Delimitacion",
        table: {
          headers: ["Campo", "Contenido"],
          rows: [
            ["Tema", text(delimitation.topic)],
            ["Contexto/lugar", text(delimitation.context_place)],
            ["Poblacion", text(delimitation.population)],
            ["Periodo", text(delimitation.time_period)],
            ["Recursos", text(delimitation.resources)],
            ["Incluye", includeItems.map((item) => item.text).join("; ")],
            ["Excluye", excludeItems.map((item) => item.text).join("; ")],
          ],
        },
      },
      {
        title: "Diseno de investigacion",
        table: {
          headers: ["Elemento", "Contenido"],
          rows: [
            ["Pregunta", text(researchDesign.research_question)],
            ["Objetivo general", text(researchDesign.general_objective)],
            [
              "Objetivos especificos",
              [...(params.specificObjectives ?? [])]
                .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))
                .map((objective) => objective.text)
                .join("; "),
            ],
          ],
        },
      },
      {
        title: "Muestra",
        table: {
          headers: ["Elemento", "Contenido"],
          rows: [
            ["Enfoque", text(sampleConfig.main_approach_code)],
            ["Alcance", text(sampleConfig.scope_code)],
            ["Fase de campo", text(sampleConfig.field_phase)],
            ["N objetivo", text(sampleConfig.target_sample_size)],
            ["Justificacion", text(sampleConfig.sample_size_rationale)],
            [
              "Tecnicas",
              (params.sample?.collection_techniques ?? [])
                .map((item) =>
                  text(item.custom_label, text(item.technique_code, "Tecnica"))
                )
                .join("; "),
            ],
          ],
        },
      },
    ],
  };
}

function dashboardMetricRows(overview: ExportDashboardOverviewLike = {}) {
  return [
    ["Documentos", text(overview.documents_count)],
    ["Segmentos", text(overview.segments_count)],
    ["Codigos", text(overview.codes_count)],
    ["Segmentos codificados", text(overview.coded_segments_count)],
    ["Memos", text(overview.memos_count)],
    ["Hallazgos", text(overview.insights_count)],
  ];
}

export function buildDashboardExportModel(params: {
  projectName: string;
  snapshot: ExportDashboardSnapshotLike;
  codes: ExportCodeLike[];
  generatedAt?: string;
}): ProjectExportModel {
  const codesById = codeMap(params.codes);
  const stats = params.snapshot.stats ?? [];
  const documentPatterns = params.snapshot.documentPatterns ?? {};

  return {
    title: `Datos del dashboard - ${params.projectName}`,
    documentKind: "Documento academico - datos analiticos",
    projectName: params.projectName,
    description:
      "Metricas, codigos principales, relaciones y patrones entre documentos.",
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    sections: [
      {
        title: "Resumen analitico",
        table: {
          headers: ["Metrica", "Valor"],
          rows: dashboardMetricRows(params.snapshot.overview ?? {}),
        },
      },
      {
        title: "Codigos principales",
        table: {
          headers: ["Codigo", "Segmentos", "Citas"],
          rows: stats.map((stat) => [
            text(stat.name, getCodeName(codesById, text(stat.code_id ?? stat.id))),
            text(countCodeUsage(stat)),
            text(stat.quotes_count ?? 0),
          ]),
        },
      },
      {
        title: "Relaciones entre codigos",
        table: {
          headers: ["Codigo origen", "Codigo destino", "Segmentos compartidos"],
          rows: (params.snapshot.relationships ?? []).map((relationship) => [
            getCodeName(codesById, text(relationship.source_code_id)),
            getCodeName(codesById, text(relationship.target_code_id)),
            text(relationship.shared_segment_count ?? 0),
          ]),
        },
      },
      {
        title: "Patrones por documento",
        table: {
          headers: ["Codigo", "Documentos", "Segmentos", "Citas"],
          rows: (documentPatterns.patterns ?? []).map((pattern) => [
            getCodeName(codesById, pattern.code_id),
            text(pattern.document_count ?? 0),
            text(pattern.total_segments ?? 0),
            text(pattern.quote_count ?? 0),
          ]),
        },
      },
    ],
  };
}

function escapePipe(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

export function renderExportAsMarkdown(model: ProjectExportModel) {
  const lines = [`# ${model.title}`, ""];

  lines.push(`**${academicKind(model)}**`, "");
  if (model.projectName) {
    lines.push(`**Proyecto:** ${model.projectName}`, "");
  }

  if (model.description) {
    lines.push(model.description, "");
  }

  lines.push(`**Generado:** ${generatedDate(model.generatedAt)}`, "");
  lines.push("## Indice", "");
  model.sections.forEach((section, index) => {
    lines.push(`${index + 1}. ${section.title}`);
  });
  lines.push("");

  for (const section of model.sections) {
    lines.push(`## ${section.title}`, "");

    for (const paragraph of section.paragraphs ?? []) {
      lines.push(paragraph, "");
    }

    if (section.table) {
      lines.push(`| ${section.table.headers.map(escapePipe).join(" | ")} |`);
      lines.push(`| ${section.table.headers.map(() => "---").join(" | ")} |`);

      for (const row of section.table.rows) {
        lines.push(`| ${row.map((cell) => escapePipe(cell)).join(" | ")} |`);
      }

      lines.push("");
    }
  }

  return lines.join("\n");
}

function tableToDocx(table: ExportTable) {
  const borderColor = "D6E4DF";

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: table.headers.map(
          (header) =>
            new TableCell({
              shading: { fill: "E8F3EF" },
              margins: { top: 140, bottom: 140, left: 180, right: 180 },
              borders: {
                top: { style: BorderStyle.SINGLE, size: 1, color: borderColor },
                bottom: { style: BorderStyle.SINGLE, size: 1, color: "9BC8BC" },
                left: { style: BorderStyle.SINGLE, size: 1, color: borderColor },
                right: { style: BorderStyle.SINGLE, size: 1, color: borderColor },
              },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: header,
                      bold: true,
                      color: "005944",
                      size: 18,
                    }),
                  ],
                }),
              ],
            })
        ),
      }),
      ...table.rows.map(
        (row) =>
          new TableRow({
            children: row.map(
              (cell) =>
                new TableCell({
                  margins: { top: 130, bottom: 130, left: 180, right: 180 },
                  borders: {
                    top: { style: BorderStyle.SINGLE, size: 1, color: borderColor },
                    bottom: { style: BorderStyle.SINGLE, size: 1, color: borderColor },
                    left: { style: BorderStyle.SINGLE, size: 1, color: borderColor },
                    right: { style: BorderStyle.SINGLE, size: 1, color: borderColor },
                  },
                  children: [
                    new Paragraph({
                      spacing: { after: 40 },
                      children: [
                        new TextRun({
                          text: cell || " ",
                          size: 18,
                          color: "163B34",
                        }),
                      ],
                    }),
                  ],
                })
            ),
          })
      ),
    ],
  });
}

export async function renderExportAsDocx(model: ProjectExportModel) {
  const children: Array<Paragraph | Table> = [
    new Paragraph({
      children: [
        new TextRun({
          text: "UVG INVESTIGACION CUALITATIVA",
          bold: true,
          color: "005944",
          size: 20,
        }),
      ],
      spacing: { after: 220 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: model.title,
          bold: true,
          color: "061B17",
          size: 38,
        }),
      ],
      heading: HeadingLevel.TITLE,
      spacing: { after: 120 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: academicKind(model),
          bold: true,
          color: "005944",
          size: 22,
        }),
      ],
      spacing: { after: 160 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: model.description ?? "",
          color: "315B67",
          size: 22,
        }),
      ],
      spacing: { after: 180 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Generado: ${generatedDate(model.generatedAt)}`,
          color: "64748B",
          size: 18,
        }),
      ],
      spacing: { after: 360 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "Indice",
          bold: true,
          color: "005944",
          size: 24,
        }),
      ],
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 80, after: 120 },
    }),
    ...model.sections.map(
      (section, index) =>
        new Paragraph({
          children: [
            new TextRun({
              text: `${index + 1}. ${section.title}`,
              color: "163B34",
              size: 20,
            }),
          ],
          spacing: { after: 80 },
        })
    ),
  ];

  for (const section of model.sections) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: section.title,
            bold: true,
            color: "061B17",
            size: 28,
          }),
        ],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 320, after: 120 },
      })
    );

    for (const paragraph of section.paragraphs ?? []) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.LEFT,
          spacing: { after: 140 },
          children: [
            new TextRun({
              text: paragraph,
              color: "163B34",
              size: 21,
            }),
          ],
        })
      );
    }

    if (section.table) {
      children.push(tableToDocx(section.table));
    }
  }

  const document = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: "Aptos",
            color: "163B34",
            size: 20,
          },
          paragraph: {
            spacing: { after: 120 },
          },
        },
      },
    },
    sections: [{ properties: {}, children }],
  });

  return Packer.toBuffer(document);
}

function wrapText(value: string, maxLength = 92) {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;

    if (next.length > maxLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);

  return lines.length ? lines : [""];
}

export async function renderExportAsPdf(model: ProjectExportModel) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const latinCharacters = new Set(font.getCharacterSet());
  const unicodeCharacters = Array.from(JSON.stringify(model)).filter(
    (character) => !latinCharacters.has(character.codePointAt(0)!)
  );
  let unicodeFont: PDFFont | undefined;
  let upperFont: PDFFont | undefined;
  if (unicodeCharacters.length) {
    pdf.registerFontkit(fontkit);
    unicodeFont = await pdf.embedFont(await readFile(join(
      process.cwd(), "src/modules/exports/fonts/unifont-15.0.06.ttf"
    )), { subset: true });
    if (unicodeCharacters.some((character) => character.codePointAt(0)! > 0xffff)) {
      upperFont = await pdf.embedFont(await readFile(join(
        process.cwd(), "src/modules/exports/fonts/unifont_upper-15.0.06.ttf"
      )), { subset: true });
    }
  }
  const unicodeCharacterSet = new Set(unicodeFont?.getCharacterSet() ?? []);
  const upperCharacterSet = new Set(upperFont?.getCharacterSet() ?? []);
  function characterFont(character: string, bold: boolean): PDFFont {
    const codePoint = character.codePointAt(0)!;
    if (latinCharacters.has(codePoint)) return bold ? boldFont : font;
    if (unicodeFont && unicodeCharacterSet.has(codePoint)) return unicodeFont;
    if (upperFont && upperCharacterSet.has(codePoint)) return upperFont;
    // Never silently replace research evidence with a missing-glyph box.
    throw new Error(`PDF font does not support U+${codePoint.toString(16).toUpperCase()}`);
  }
  const pageSize = { width: 612, height: 792 };
  const margin = 48;
  let page = pdf.addPage([pageSize.width, pageSize.height]);
  let y = pageSize.height - margin;
  let pageNumber = 1;

  function ensureSpace(height = 18) {
    if (y - height > margin) return;
    drawFooter();
    page = pdf.addPage([pageSize.width, pageSize.height]);
    pageNumber += 1;
    y = pageSize.height - margin;
  }

  function drawFooter() {
    page.drawText(`UVG Investigacion cualitativa  |  ${pageNumber}`, {
      x: margin,
      y: 28,
      size: 8,
      font,
      color: rgb(0.35, 0.45, 0.48),
    });
  }

  function drawLine(
    value: string,
    options?: { bold?: boolean; size?: number; color?: ReturnType<typeof rgb> }
  ) {
    const size = options?.size ?? 10;
    const bold = options?.bold ?? false;

    const lines: string[] = [];
    for (const line of wrapText(value, options?.size && options.size > 12 ? 62 : 92)) {
      let part = "";
      let width = 0;
      for (const character of line) {
        const advance = characterFont(character, bold).widthOfTextAtSize(character, size);
        if (part && width + advance > pageSize.width - margin * 2) {
          lines.push(part);
          part = "";
          width = 0;
        }
        part += character;
        width += advance;
      }
      lines.push(part);
    }
    for (const line of lines) {
      ensureSpace(size + 6);
      const runs: { font: PDFFont; text: string }[] = [];
      for (const character of line) {
        const runFont = characterFont(character, bold);
        const previous = runs.at(-1);
        if (previous?.font === runFont) previous.text += character;
        else runs.push({ font: runFont, text: character });
      }
      // One text object per visual line keeps mixed scripts selectable as one line.
      page.pushOperators(
        pushGraphicsState(), beginText(),
        setFillingColor(options?.color ?? rgb(0.02, 0.08, 0.12)),
        setTextMatrix(1, 0, 0, 1, margin, y),
        ...runs.flatMap((run) => {
          const key = PDFName.of(`ExportFont${run.font.ref.objectNumber}`);
          page.node.setFontDictionary(key, run.font.ref);
          return [setFontAndSize(key, size), showText(run.font.encodeText(run.text))];
        }),
        endText(), popGraphicsState()
      );
      y -= size + 6;
    }
  }

  page.drawRectangle({
    x: 0,
    y: pageSize.height - 154,
    width: pageSize.width,
    height: 154,
    color: rgb(0.92, 0.97, 0.95),
  });
  page.drawRectangle({
    x: 0,
    y: pageSize.height - 154,
    width: 8,
    height: 154,
    color: rgb(0, 0.35, 0.27),
  });
  drawLine("UVG INVESTIGACION CUALITATIVA", {
    bold: true,
    size: 9,
    color: rgb(0, 0.35, 0.27),
  });
  y -= 8;
  drawLine(model.title, { bold: true, size: 21 });
  drawLine(academicKind(model), {
    bold: true,
    size: 11,
    color: rgb(0, 0.35, 0.27),
  });
  if (model.description) drawLine(model.description, { size: 10 });
  drawLine(`Generado: ${generatedDate(model.generatedAt)}`, {
    size: 8,
    color: rgb(0.35, 0.45, 0.48),
  });
  y -= 24;

  drawLine("Indice", { bold: true, size: 13, color: rgb(0, 0.35, 0.27) });
  model.sections.forEach((section, index) => {
    drawLine(`${index + 1}. ${section.title}`, { size: 9 });
  });
  y -= 16;

  for (const section of model.sections) {
    ensureSpace(46);
    page.drawRectangle({
      x: margin,
      y: y - 6,
      width: pageSize.width - margin * 2,
      height: 1,
      color: rgb(0.78, 0.88, 0.84),
    });
    y -= 20;
    drawLine(section.title, {
      bold: true,
      size: 14,
      color: rgb(0, 0.25, 0.2),
    });

    for (const paragraph of section.paragraphs ?? []) {
      drawLine(paragraph, { size: 10 });
    }

    if (section.table) {
      drawLine(section.table.headers.join("  |  "), {
        bold: true,
        size: 8,
        color: rgb(0, 0.35, 0.27),
      });
      for (const [rowIndex, row] of section.table.rows.entries()) {
        ensureSpace(18);
        if (rowIndex % 2 === 0) {
          page.drawRectangle({
            x: margin - 4,
            y: y - 3,
            width: pageSize.width - margin * 2 + 8,
            height: 14,
            color: rgb(0.97, 0.98, 0.98),
          });
        }
        drawLine(row.join("  |  "), { size: 7.5 });
      }
    }

    y -= 8;
  }

  drawFooter();

  return Buffer.from(await pdf.save());
}

function slugifyFilePart(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function renderExportBundleAsZip(models: ProjectExportModel[]) {
  const zip = new JSZip();

  for (const [index, model] of models.entries()) {
    const baseName =
      slugifyFilePart(model.title) || `export-${String(index + 1).padStart(2, "0")}`;
    zip.file(`${baseName}.md`, renderExportAsMarkdown(model));
    zip.file(`${baseName}.docx`, await renderExportAsDocx(model));
    zip.file(`${baseName}.pdf`, await renderExportAsPdf(model));
  }

  return zip.generateAsync({ type: "nodebuffer" });
}
