import { randomUUID } from "node:crypto";
import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";
import {
  assertDocxArchive,
  assertDownload,
  assertPdfDocument,
  extractDocxText,
  extractPdfText,
  inspectZipArchive,
} from "@/__tests__/backend/binary-assertions";
import {
  createQaProjectFixture,
  type QaProjectFixture,
} from "@/__tests__/backend/project-fixture";
import {
  closeQaSessions,
  createQaSessions,
  type QaSessions,
} from "@/__tests__/backend/sessions";
import { actionEvidenceTitle } from "@/__tests__/backend/action-evidence";
import { codeFixtureData } from "@/__tests__/backend/task10-test-helpers";
import { normalizeSemanticWhitespace } from "@/__tests__/backend/task8-test-helpers";
import { materializeRoute } from "@/__tests__/integration/documents/task9-test-helpers";

export const BACKEND_ROUTE_COVERAGE = [
  ["GET", "/api/projects/:id/exports/:exportType"],
] as const;

const ROUTE = "/api/projects/:id/exports/:exportType";
const EXPORT_TYPES = [
  "codebook",
  "evidence",
  "quotes",
  "insights",
  "dashboard",
  "protocol",
] as const;
const FORMATS = ["md", "docx", "pdf"] as const;
const BUNDLE_SCOPES = ["protocol", "evidence", "report", "all"] as const;
const CONTENT_TYPES = {
  md: "text/markdown; charset=utf-8",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
  zip: "application/zip",
} as const;
const BUNDLE_TYPES = {
  protocol: ["protocol"],
  evidence: ["codebook", "evidence", "quotes"],
  report: ["dashboard", "insights"],
  all: ["protocol", "codebook", "evidence", "quotes", "dashboard", "insights"],
} as const;
const FRONTEND_INDIVIDUAL_EXPORTS = [
  ["codebook", "docx"],
  ["codebook", "pdf"],
  ["dashboard", "pdf"],
  ["evidence", "docx"],
  ["insights", "docx"],
  ["quotes", "docx"],
  ["protocol", "docx"],
  ["protocol", "pdf"],
] as const satisfies readonly (readonly [ExportType, ExportFormat])[];
const FRONTEND_BUNDLE_SCOPES = ["evidence", "report", "all"] as const satisfies readonly BundleScope[];

type ExportType = (typeof EXPORT_TYPES)[number];
type ExportFormat = (typeof FORMATS)[number];
type BundleScope = (typeof BUNDLE_SCOPES)[number];
type JsonBody = Record<string, unknown>;

let sessions: QaSessions | undefined;
let fixture: QaProjectFixture | undefined;
let foreignFixture: QaProjectFixture | undefined;
let emptyFixture: QaProjectFixture | undefined;
let anonymousRequest: APIRequestContext | undefined;

let primaryCodeSentinel = "";
let primaryChildCodeSentinel = "";
let primaryQuoteSentinel = "";
let primaryInsightSentinel = "";
let foreignSentinel = "";
let deletedSentinel = "";

function slug(value: string, limit: number): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, limit);
}

function title(type: ExportType, projectName: string): string {
  const prefix: Record<ExportType, string> = {
    codebook: "Codebook",
    evidence: "Evidencias por codigo",
    quotes: "Citas textuales",
    insights: "Bitacora de hallazgos",
    dashboard: "Datos del dashboard",
    protocol: "Protocolo de investigacion",
  };
  return `${prefix[type]} - ${projectName}`;
}

function exportPath(
  exportType: string,
  projectId = fixture!.project.id
): string {
  return materializeRoute(ROUTE, { id: projectId, exportType });
}

function individualFilename(
  type: ExportType,
  format: ExportFormat,
  projectName = fixture!.project.name
): string {
  return `${slug(title(type, projectName), 90)}.${format}`;
}

function bundleFilename(scope: BundleScope, projectId = fixture!.project.id): string {
  return `project-${projectId}-bundle-${scope}.zip`;
}

function bundleMembers(
  scope: BundleScope,
  projectName = fixture!.project.name
): string[] {
  return BUNDLE_TYPES[scope]
    .flatMap((type) => {
      const base = slug(title(type, projectName), 80);
      return [`${base}.md`, `${base}.docx`, `${base}.pdf`];
    })
    .sort();
}

async function json(response: APIResponse): Promise<JsonBody> {
  expect(response.headers()["content-type"]).toMatch(/^application\/json(?:;|$)/u);
  const value: unknown = await response.json();
  expect(value).toEqual(expect.any(Object));
  return value as JsonBody;
}

async function strictUtf8(bytes: Buffer): Promise<string> {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function normalizedTextEntries(values: Map<string, string>): Array<[string, string]> {
  return Array.from(
    values,
    ([name, value]) => [name, normalizeSemanticWhitespace(value)] as [string, string]
  )
    .sort(([left], [right]) => left.localeCompare(right));
}

async function extractFrontendExportText(
  response: APIResponse,
  type: ExportType,
  format: "docx" | "pdf"
): Promise<string> {
  const bytes = await assertDownload(response, {
    filename: individualFilename(type, format),
    contentType: CONTENT_TYPES[format],
    signature: format === "pdf" ? "%PDF-" : "PK",
  });
  let text: string;
  if (format === "docx") {
    await assertDocxArchive(bytes);
    text = await extractDocxText(bytes);
  } else {
    expect((await assertPdfDocument(bytes)).pageCount).toBeGreaterThan(0);
    text = await extractPdfText(bytes);
  }
  assertPrimaryContent(type, text);
  assertNoForeignOrDeleted(text);
  return normalizeSemanticWhitespace(text);
}

async function createResource(
  request: APIRequestContext,
  path: string,
  data: Record<string, unknown>,
  key: string
): Promise<Record<string, unknown>> {
  const response = await request.post(path, { data });
  const responseBody = await json(response);
  expect(response.status(), JSON.stringify(responseBody)).toBe(201);
  expect(responseBody[key]).toEqual(expect.any(Object));
  return responseBody[key] as Record<string, unknown>;
}

async function seedActiveCorpus(
  project: QaProjectFixture,
  sentinel: string
): Promise<void> {
  const request = sessions!.owner.request;
  const root = `/api/projects/${project.project.id}`;
  const code = await createResource(
    request,
    `${root}/analysis/codes`,
    codeFixtureData({
      name: `${sentinel}_CODE`,
      description: `${sentinel}_CODE_DESCRIPTION`,
      definition: `${sentinel}_CODE_DEFINITION`,
    }),
    "code"
  );
  await createResource(
    request,
    `${root}/analysis/codes`,
    codeFixtureData({
      name: `${sentinel}_CHILD_CODE`,
      description: `${sentinel}_CHILD_DESCRIPTION`,
      definition: `${sentinel}_CHILD_DEFINITION`,
      parent_code_id: code.id,
    }),
    "code"
  );
  const content = `alpha ${sentinel}_QUOTE omega`;
  const document = await createResource(
    request,
    `${root}/documents`,
    { title: `${sentinel}_DOCUMENT`, content, status: "ready_for_coding" },
    "document"
  );
  const selectedText = `${sentinel}_QUOTE`;
  const start = content.indexOf(selectedText);
  const segment = await createResource(
    request,
    `${root}/documents/${String(document.id)}/segments`,
    {
      base_document_revision: document.revision,
      start_char: start,
      end_char: start + selectedText.length,
      selected_text: selectedText,
    },
    "segment"
  );
  await createResource(
    request,
    `${root}/analysis/segments/${String(segment.id)}/codes`,
    {
      code_id: code.id,
      is_quote: true,
      quote_label: `${sentinel}_QUOTE_LABEL`,
      analytic_note: `${sentinel}_ANALYTIC_NOTE`,
    },
    "segment_code"
  );
  await createResource(
    request,
    `${root}/analysis/insights`,
    {
      title: `${sentinel}_INSIGHT`,
      summary: `${sentinel}_INSIGHT_SUMMARY`,
      interpretation: `${sentinel}_INTERPRETATION`,
      status: "confirmed",
      confidence: "high",
    },
    "insight"
  );
}

async function seedDeletedResources(project: QaProjectFixture, sentinel: string) {
  const request = sessions!.owner.request;
  const root = `/api/projects/${project.project.id}`;
  const code = await createResource(
    request,
    `${root}/analysis/codes`,
    codeFixtureData({ name: `${sentinel}_CODE`, description: sentinel }),
    "code"
  );
  const insight = await createResource(
    request,
    `${root}/analysis/insights`,
    { title: `${sentinel}_INSIGHT`, summary: sentinel },
    "insight"
  );
  const document = await createResource(
    request,
    `${root}/documents`,
    {
      title: `${sentinel}_DOCUMENT`,
      content: `before ${sentinel}_QUOTE after`,
      status: "ready_for_coding",
    },
    "document"
  );
  const selectedText = `${sentinel}_QUOTE`;
  const start = String(document.content ?? `before ${selectedText} after`).indexOf(
    selectedText
  );
  const segment = await createResource(
    request,
    `${root}/documents/${String(document.id)}/segments`,
    {
      base_document_revision: document.revision,
      start_char: start < 0 ? 7 : start,
      end_char: (start < 0 ? 7 : start) + selectedText.length,
      selected_text: selectedText,
    },
    "segment"
  );
  const segmentCode = await createResource(
    request,
    `${root}/analysis/segments/${String(segment.id)}/codes`,
    {
      code_id: code.id,
      is_quote: true,
      quote_label: `${sentinel}_QUOTE_LABEL`,
      analytic_note: `${sentinel}_ANALYTIC_NOTE`,
    },
    "segment_code"
  );

  const assignmentDelete = await request.delete(
    `${root}/analysis/segments/${String(segment.id)}/codes/${String(segmentCode.id)}`
  );
  expect(assignmentDelete.status(), "delete exact seeded segment-code before its code").toBe(200);

  for (const path of [
    `${root}/analysis/codes/${String(code.id)}`,
    `${root}/analysis/insights/${String(insight.id)}`,
    `${root}/documents/${String(document.id)}`,
  ]) {
    const response = await request.delete(path);
    expect(response.status(), path).toBe(200);
  }
}

async function seedProtocolInputs(
  project: QaProjectFixture,
  sentinel: string
): Promise<void> {
  const request = sessions!.owner.request;
  const root = `/api/projects/${project.project.id}`;
  const cases = [
    {
      path: `${root}/delimitation`,
      key: "delim",
      patch: { topic: `${sentinel}_DELIMITATION` },
    },
    {
      path: `${root}/research-design`,
      key: "design",
      patch: { research_question: `${sentinel}_RESEARCH_QUESTION` },
    },
    {
      path: `${root}/sample-config`,
      key: "config",
      patch: { field_phase: `${sentinel}_FIELD_PHASE` },
    },
  ] as const;

  for (const item of cases) {
    const currentResponse = await request.get(item.path);
    const currentBody = await json(currentResponse);
    expect(currentResponse.status(), item.path).toBe(200);
    const data = currentBody.data as Record<string, unknown>;
    const current = data[item.key] as Record<string, unknown>;
    const response = await request.put(item.path, {
      data: { base_revision: current.revision, ...item.patch },
    });
    expect(response.status(), JSON.stringify(await json(response))).toBe(200);
  }
}

function assertNoForeignOrDeleted(text: string): void {
  const semanticText = normalizeSemanticWhitespace(text);
  expect(semanticText).not.toContain(
    normalizeSemanticWhitespace(foreignSentinel)
  );
  expect(semanticText).not.toContain(
    normalizeSemanticWhitespace(deletedSentinel)
  );
}

function assertCodeHierarchy(text: string): void {
  const semanticText = normalizeSemanticWhitespace(text);
  const parentIndex = semanticText.indexOf(
    normalizeSemanticWhitespace(primaryCodeSentinel)
  );
  const childIndex = semanticText.indexOf(
    normalizeSemanticWhitespace(primaryChildCodeSentinel)
  );
  expect(parentIndex).toBeGreaterThanOrEqual(0);
  expect(childIndex).toBeGreaterThan(parentIndex);
  expect(semanticText).toContain("Subcodigo");
}

function assertPrimaryContent(type: ExportType, text: string): void {
  const semanticText = normalizeSemanticWhitespace(text);
  expect(semanticText).toContain(
    normalizeSemanticWhitespace(fixture!.project.name)
  );
  if (["codebook", "evidence", "quotes", "dashboard"].includes(type)) {
    expect(semanticText).toContain(normalizeSemanticWhitespace(primaryCodeSentinel));
  }
  if (type === "evidence" || type === "quotes") {
    expect(semanticText).toContain(normalizeSemanticWhitespace(primaryQuoteSentinel));
  }
  if (type === "insights") {
    expect(semanticText).toContain(
      normalizeSemanticWhitespace(primaryInsightSentinel)
    );
  }
  if (type === "codebook") assertCodeHierarchy(semanticText);
}

function assertSafeErrorBody(body: JsonBody): void {
  const serialized = JSON.stringify(body);
  assertNoForeignOrDeleted(serialized);
  expect(serialized).not.toContain(fixture!.marker);
  expect(serialized.toLowerCase()).not.toContain("password");
  expect(serialized.toLowerCase()).not.toContain("authorization");
}

async function teardown(): Promise<void> {
  const failures: unknown[] = [];
  for (const project of [emptyFixture, foreignFixture, fixture]) {
    if (!project) continue;
    try {
      await project.cleanup();
    } catch (error) {
      failures.push(error);
    }
  }
  if (anonymousRequest) {
    try {
      await anonymousRequest.dispose();
    } catch (error) {
      failures.push(error);
    }
  }
  if (sessions) {
    try {
      await closeQaSessions(sessions);
    } catch (error) {
      failures.push(error);
    }
  }

  emptyFixture = undefined;
  foreignFixture = undefined;
  fixture = undefined;
  anonymousRequest = undefined;
  sessions = undefined;

  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(failures, "Project export teardown failed");
  }
}

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.beforeAll(async () => {
  sessions = await createQaSessions();
  fixture = await createQaProjectFixture(sessions);
  foreignFixture = await createQaProjectFixture(sessions);
  emptyFixture = await createQaProjectFixture(sessions);

  const baseURL = process.env.BACKEND_TEST_BASE_URL ?? "http://localhost:3000";
  anonymousRequest = await playwrightRequest.newContext({
    baseURL,
    extraHTTPHeaders: { origin: new URL(baseURL).origin },
  });

  primaryCodeSentinel = `${fixture.marker}_PRIMARY_CODE`;
  primaryChildCodeSentinel = `${fixture.marker}_PRIMARY_CHILD_CODE`;
  primaryQuoteSentinel = `${fixture.marker}_PRIMARY_QUOTE`;
  primaryInsightSentinel = `${fixture.marker}_PRIMARY_INSIGHT`;
  foreignSentinel = `${foreignFixture.marker}_FOREIGN`;
  deletedSentinel = `${fixture.marker}_DELETED`;

  await seedActiveCorpus(fixture, `${fixture.marker}_PRIMARY`);
  await seedActiveCorpus(foreignFixture, foreignSentinel);
  await seedProtocolInputs(foreignFixture, foreignSentinel);
  await seedDeletedResources(fixture, deletedSentinel);
});

test.afterAll(async () => {
  await teardown();
});

test([
  actionEvidenceTitle("exports.codebook.download", ["success"], "exports a semantically valid codebook in every supported format"),
  actionEvidenceTitle("exports.evidence.download", ["success"], "exports semantically valid evidence in every supported format"),
  actionEvidenceTitle("exports.quotes.download", ["success"], "exports semantically valid quotes in every supported format"),
  actionEvidenceTitle("exports.insights.download", ["success"], "exports semantically valid insights in every supported format"),
  actionEvidenceTitle("exports.dashboard.download", ["success"], "exports a semantically valid dashboard in every supported format"),
  actionEvidenceTitle("exports.protocol.download", ["success"], "exports a semantically valid protocol in every supported format"),
].join(" | "), async () => {
  for (const type of EXPORT_TYPES) {
    for (const format of FORMATS) {
      const response = await sessions!.owner.request.get(
        `${exportPath(type)}?format=${format}`
      );
      const bytes = await assertDownload(response, {
        filename: individualFilename(type, format),
        contentType: CONTENT_TYPES[format],
        signature: format === "pdf" ? "%PDF-" : format === "docx" ? "PK" : undefined,
      });

      let extractedText: string;
      if (format === "md") {
        extractedText = await strictUtf8(bytes);
        expect(extractedText).toContain(`# ${title(type, fixture!.project.name)}`);
      } else if (format === "docx") {
        await assertDocxArchive(bytes);
        extractedText = await extractDocxText(bytes);
      } else {
        expect((await assertPdfDocument(bytes)).pageCount).toBeGreaterThan(0);
        extractedText = await extractPdfText(bytes);
      }
      assertPrimaryContent(type, extractedText);
      assertNoForeignOrDeleted(extractedText);
    }
  }
});

test(actionEvidenceTitle(
  "exports.bundle.download",
  ["success"],
  "exports exact, safe, recursively valid ZIP members for every bundle scope"
), async () => {
  for (const scope of BUNDLE_SCOPES) {
    const response = await sessions!.editor.request.get(
      `${exportPath("bundle")}?format=zip&scope=${scope}`
    );
    const bytes = await assertDownload(response, {
      filename: bundleFilename(scope),
      contentType: CONTENT_TYPES.zip,
      signature: "PK",
    });
    const inspected = await inspectZipArchive(bytes, bundleMembers(scope));

    expect(inspected.members).toEqual(bundleMembers(scope));
    expect(inspected.pdfPages.size).toBe(BUNDLE_TYPES[scope].length);
    for (const type of BUNDLE_TYPES[scope]) {
      const markdownName = `${slug(title(type, fixture!.project.name), 80)}.md`;
      const markdown = inspected.markdown.get(markdownName);
      expect(markdown, markdownName).toBeDefined();
      const baseName = markdownName.slice(0, -3);
      const texts = [
        markdown!,
        inspected.docxText.get(`${baseName}.docx`),
        inspected.pdfText.get(`${baseName}.pdf`),
      ];
      for (const text of texts) {
        expect(text, `${baseName} semantic text`).toBeDefined();
        assertPrimaryContent(type, text!);
        assertNoForeignOrDeleted(text!);
      }
    }
  }
});

test("renders all export models for an empty project without empty binary artifacts", async () => {
  for (const type of EXPORT_TYPES) {
    const response = await sessions!.owner.request.get(
      `${exportPath(type, emptyFixture!.project.id)}?format=md`
    );
    const bytes = await assertDownload(response, {
      filename: individualFilename(type, "md", emptyFixture!.project.name),
      contentType: CONTENT_TYPES.md,
    });
    const markdown = await strictUtf8(bytes);
    expect(markdown).toContain(emptyFixture!.project.name);
    assertNoForeignOrDeleted(markdown);
  }

  const bundle = await sessions!.owner.request.get(
    exportPath("bundle", emptyFixture!.project.id)
  );
  const bytes = await assertDownload(bundle, {
    filename: bundleFilename("all", emptyFixture!.project.id),
    contentType: CONTENT_TYPES.zip,
    signature: "PK",
  });
  const inspected = await inspectZipArchive(
    bytes,
    bundleMembers("all", emptyFixture!.project.name)
  );
  for (const markdown of inspected.markdown.values()) {
    expect(markdown).toContain(emptyFixture!.project.name);
    assertNoForeignOrDeleted(markdown);
  }
});

test([
  actionEvidenceTitle("exports.bundle.download", ["permissions"], "allows project members and denies non-members"),
  actionEvidenceTitle("exports.codebook.download", ["permissions"], "allows project members and denies non-members"),
  actionEvidenceTitle("exports.evidence.download", ["permissions"], "allows project members and denies non-members"),
  actionEvidenceTitle("exports.quotes.download", ["permissions"], "allows project members and denies non-members"),
  actionEvidenceTitle("exports.insights.download", ["permissions"], "allows project members and denies non-members"),
  actionEvidenceTitle("exports.dashboard.download", ["permissions"], "allows project members and denies non-members"),
  actionEvidenceTitle("exports.protocol.download", ["permissions"], "allows project members and denies non-members"),
].join(" | "), async () => {
  for (const type of EXPORT_TYPES) {
    const frontendPair = FRONTEND_INDIVIDUAL_EXPORTS.find(([candidate]) => candidate === type)!;
    const path = `${exportPath(type)}?format=${frontendPair[1]}`;
    for (const role of ["owner", "editor", "viewer"] as const) {
      const member = await sessions![role].request.get(path);
      expect(member.status(), `${role} ${type}`).toBe(200);
      expect(member.headers()["cache-control"]).toBe("no-store");
    }
    const intruder = await sessions!.intruder.request.get(path);
    expect(intruder.status(), `intruder ${type}`).toBe(403);
    assertSafeErrorBody(await json(intruder));
    const unauthenticated = await anonymousRequest!.get(path);
    expect(unauthenticated.status(), `anonymous ${type}`).toBe(401);
    assertSafeErrorBody(await json(unauthenticated));
  }

  const bundlePath = `${exportPath("bundle")}?format=zip&scope=report`;
  for (const role of ["owner", "editor", "viewer"] as const) {
    const member = await sessions![role].request.get(bundlePath);
    expect(member.status(), `${role} bundle`).toBe(200);
    expect(member.headers()["cache-control"]).toBe("no-store");
  }
  for (const [requestContext, status] of [
    [sessions!.intruder.request, 403],
    [anonymousRequest!, 401],
  ] as const) {
    const response = await requestContext.get(bundlePath);
    expect(response.status(), bundlePath).toBe(status);
    const responseBody = await json(response);
    expect(responseBody).toEqual({ ok: false, error: expect.any(String) });
    assertSafeErrorBody(responseBody);
  }
});

test([
  actionEvidenceTitle("exports.codebook.download", ["success"], "returns identical semantic output for simultaneous retries"),
  actionEvidenceTitle("exports.evidence.download", ["success"], "returns identical semantic output for simultaneous retries"),
  actionEvidenceTitle("exports.quotes.download", ["success"], "returns identical semantic output for simultaneous retries"),
  actionEvidenceTitle("exports.insights.download", ["success"], "returns identical semantic output for simultaneous retries"),
  actionEvidenceTitle("exports.dashboard.download", ["success"], "returns identical semantic output for simultaneous retries"),
  actionEvidenceTitle("exports.protocol.download", ["success"], "returns identical semantic output for simultaneous retries"),
  actionEvidenceTitle("exports.bundle.download", ["success"], "returns identical semantic bundle output for simultaneous retries"),
].join(" | "), async () => {
  for (const [type, format] of FRONTEND_INDIVIDUAL_EXPORTS) {
    const responses = await Promise.all([
      sessions!.owner.request.get(`${exportPath(type)}?format=${format}`),
      sessions!.owner.request.get(`${exportPath(type)}?format=${format}`),
    ]);
    const texts = await Promise.all(responses.map((response) =>
      extractFrontendExportText(response, type, format)
    ));
    expect(texts[1]).toBe(texts[0]);
  }

  for (const scope of FRONTEND_BUNDLE_SCOPES) {
    const bundles = await Promise.all([
      sessions!.owner.request.get(`${exportPath("bundle")}?scope=${scope}`),
      sessions!.owner.request.get(`${exportPath("bundle")}?scope=${scope}`),
    ]);
    const inspected = await Promise.all(bundles.map(async (response) =>
      inspectZipArchive(
        await assertDownload(response, {
          filename: bundleFilename(scope),
          contentType: CONTENT_TYPES.zip,
          signature: "PK",
        }),
        bundleMembers(scope)
      )
    ));
    expect(inspected[1].members).toEqual(inspected[0].members);
    expect(normalizedTextEntries(inspected[1].markdown)).toEqual(
      normalizedTextEntries(inspected[0].markdown)
    );
    expect(normalizedTextEntries(inspected[1].docxText)).toEqual(
      normalizedTextEntries(inspected[0].docxText)
    );
    expect(normalizedTextEntries(inspected[1].pdfText)).toEqual(
      normalizedTextEntries(inspected[0].pdfText)
    );
    for (const type of BUNDLE_TYPES[scope]) {
      const base = slug(title(type, fixture!.project.name), 80);
      for (const text of [
        inspected[0].markdown.get(`${base}.md`),
        inspected[0].docxText.get(`${base}.docx`),
        inspected[0].pdfText.get(`${base}.pdf`),
      ]) {
        expect(text, `${scope} ${type} semantic text`).toBeDefined();
        assertPrimaryContent(type, text!);
        assertNoForeignOrDeleted(text!);
      }
    }
  }
});

test("returns exact validation errors without sensitive export data", async () => {
  for (const path of [
    exportPath("unknown"),
    `${exportPath("protocol")}?format=csv`,
    `${exportPath("bundle")}?scope=unknown`,
  ]) {
    const response = await sessions!.owner.request.get(path);
    expect(response.status(), path).toBe(400);
    const responseBody = await json(response);
    expect(responseBody).toEqual({
      ok: false,
      error: "VALIDATION_ERROR",
      details: { formErrors: [expect.any(String)], fieldErrors: {} },
    });
    assertSafeErrorBody(responseBody);
  }

  const zip = await sessions!.owner.request.get(
    `${exportPath("protocol")}?format=zip`
  );
  expect(zip.status()).toBe(400);
  const zipBody = await json(zip);
  expect(zipBody).toEqual({
    ok: false,
    error: "VALIDATION_ERROR",
    details: { format: ["ZIP is only available for bundle exports."] },
  });
  assertSafeErrorBody(zipBody);

  const invalidId = await sessions!.owner.request.get(
    exportPath("protocol", "not-a-uuid")
  );
  expect(invalidId.status()).toBe(400);
  const invalidIdBody = await json(invalidId);
  expect(invalidIdBody).toEqual({ ok: false, error: "INVALID_PROJECT_ID" });
  assertSafeErrorBody(invalidIdBody);
});

test("denies a valid nonexistent project UUID without leaking project data", async () => {
  const response = await sessions!.owner.request.get(
    exportPath("protocol", randomUUID())
  );
  expect(response.status()).toBe(403);
  const responseBody = await json(response);
  expect(responseBody).toEqual({ ok: false, error: "FORBIDDEN" });
  assertSafeErrorBody(responseBody);
});

test("defaults individual exports to DOCX and bundle scope to an all-content ZIP", async () => {
  const individual = await sessions!.viewer.request.get(exportPath("protocol"));
  const docx = await assertDownload(individual, {
    filename: individualFilename("protocol", "docx"),
    contentType: CONTENT_TYPES.docx,
    signature: "PK",
  });
  await assertDocxArchive(docx);

  const response = await sessions!.viewer.request.get(
    `${exportPath("bundle")}?format=md`
  );
  const bytes = await assertDownload(response, {
    filename: bundleFilename("all"),
    contentType: CONTENT_TYPES.zip,
    signature: "PK",
  });
  await expect(
    inspectZipArchive(bytes, bundleMembers("all"))
  ).resolves.toMatchObject({ members: bundleMembers("all") });
});
