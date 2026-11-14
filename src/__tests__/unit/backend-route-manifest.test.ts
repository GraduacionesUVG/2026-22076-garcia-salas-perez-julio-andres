import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  assertRouteCoverage,
  auditRouteCoverage,
  discoverApiRoutes,
  resolveRepositoryRoot,
} from "@/__tests__/backend/route-coverage";
import {
  normalizeRoutePath,
  routeManifest,
  type RouteContract,
} from "@/__tests__/backend/route-manifest";

const roots: string[] = [];

function fixtureRoot(options: { api?: boolean } = {}): string {
  const root = mkdtempSync(path.join(tmpdir(), "route-coverage-"));
  roots.push(root);
  writeFileSync(path.join(root, "package.json"), "{}", "utf8");
  if (options.api !== false) {
    mkdirSync(path.join(root, "app", "api"), { recursive: true });
  }
  return root;
}

function writeRoute(root: string, relativeFile: string, source: string): void {
  const file = path.join(root, relativeFile);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, source, "utf8");
}

function writeSpec(root: string, relativeFile: string, source: string): void {
  const file = path.join(root, relativeFile);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, source, "utf8");
}

function contract(
  file: RouteContract["file"],
  methods: RouteContract["methods"],
  overrides: Partial<RouteContract> = {}
): RouteContract {
  return {
    file,
    path: normalizeRoutePath(file),
    methods,
    module: "projects",
    spec: "__tests__/integration/projects/projects-contracts.spec.ts",
    exclusions: [],
    ...overrides,
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("route discovery", () => {
  it("normalizes the root API route without a trailing slash", () => {
    expect(normalizeRoutePath("app/api/route.ts")).toBe("/api");
  });

  it("normalizes Windows separators and dynamic route segments", () => {
    expect(
      normalizeRoutePath(
        "app\\api\\projects\\[id]\\documents\\[documentId]\\route.ts"
      )
    ).toBe("/api/projects/:id/documents/:documentId");
    expect(normalizeRoutePath("app/api/files/[...parts]/route.ts")).toBe(
      "/api/files/:parts*"
    );
    expect(normalizeRoutePath("app/api/files/[[...parts]]/route.ts")).toBe(
      "/api/files/:parts*?"
    );
  });

  it("removes route groups and preserves valid Next parameter names", () => {
    expect(
      normalizeRoutePath(
        "app/api/(internal)/projects/[project-id]/[...rest.parts]/route.ts"
      )
    ).toBe("/api/projects/:project-id/:rest.parts*");
    expect(
      normalizeRoutePath(
        "app/api/(interno)/archivos/[[...secciones-á]]/route.ts"
      )
    ).toBe("/api/archivos/:secciones-á*?");
  });

  it("discovers every supported exported HTTP method", () => {
    const root = fixtureRoot();
    writeRoute(
      root,
      "app/api/widgets/[widgetId]/route.ts",
      [
        "export async function GET() {}",
        "export const POST = async () => {};",
        "const PATCH = async () => {};",
        "export { PATCH };",
        "export function HEAD() {}",
        "export async function OPTIONS() {}",
      ].join("\n")
    );

    expect(discoverApiRoutes(root)).toEqual([
      {
        file: "app/api/widgets/[widgetId]/route.ts",
        path: "/api/widgets/:widgetId",
        methods: ["GET", "HEAD", "POST", "PATCH", "OPTIONS"],
      },
    ]);
  });

  it("ignores type-only HTTP method exports", () => {
    const root = fixtureRoot();
    writeRoute(
      root,
      "app/api/types/route.ts",
      [
        "type GET = () => void;",
        "type OPTIONS = () => void;",
        "export type { GET, OPTIONS };",
        "export function POST() {}",
      ].join("\n")
    );

    expect(discoverApiRoutes(root)[0]?.methods).toEqual(["POST"]);
  });

  it("rejects duplicate runtime HTTP handler exports", () => {
    const root = fixtureRoot();
    writeRoute(
      root,
      "app/api/duplicate/route.ts",
      [
        "export function GET() {}",
        "const second = () => {};",
        "export { second as GET };",
      ].join("\n")
    );

    expect(() => discoverApiRoutes(root)).toThrow(
      "Duplicate HTTP handler export: GET app/api/duplicate/route.ts"
    );
  });

  it("counts only runtime function implementations, not overload signatures", () => {
    const root = fixtureRoot();
    writeRoute(
      root,
      "app/api/overloads/route.ts",
      [
        "export function GET(value: string): Response;",
        "export function GET(value: number): Response;",
        "export function GET(value: string | number) { return new Response(String(value)); }",
        "export function HEAD(): Response;",
      ].join("\n")
    );

    expect(discoverApiRoutes(root)[0]?.methods).toEqual(["GET"]);
  });

  it("rejects malformed dynamic paths", () => {
    expect(() => normalizeRoutePath("app/api/projects/[id/route.ts")).toThrow(
      "Malformed dynamic route segment"
    );
  });

  it.each([
    "app/api/projects/[]/route.ts",
    "app/api/projects/[...]/route.ts",
    "app/api/projects/[[...slug]/route.ts",
    "app/api/projects/[slug]]/route.ts",
  ])("rejects malformed bracket segment %s", (file) => {
    expect(() => normalizeRoutePath(file)).toThrow(
      "Malformed dynamic route segment"
    );
  });
});

describe("coverage diagnostics", () => {
  it("assigns document text and project export routes to separate owning specs", () => {
    const byPath = new Map(routeManifest.map((entry) => [entry.path, entry.spec]));

    expect(byPath.get("/api/projects/:id/documents/:documentId/export")).toBe(
      "__tests__/integration/documents/document-export.spec.ts"
    );
    expect(byPath.get("/api/projects/:id/exports/:exportType")).toBe(
      "__tests__/integration/exports/project-exports.spec.ts"
    );
  });

  it("detects a newly added route", () => {
    const root = fixtureRoot();
    writeRoute(root, "app/api/new/route.ts", "export function GET() {}");

    const report = auditRouteCoverage({ root, manifest: [] });

    expect(report.structuralErrors).toContain(
      "Unowned route method: GET /api/new (app/api/new/route.ts)"
    );
  });

  it("detects a newly added method", () => {
    const root = fixtureRoot();
    writeRoute(
      root,
      "app/api/projects/route.ts",
      "export function GET() {}\nexport function POST() {}"
    );

    const report = auditRouteCoverage({
      root,
      manifest: [contract("app/api/projects/route.ts", ["GET"])],
    });

    expect(report.structuralErrors).toContain(
      "Unowned route method: POST /api/projects (app/api/projects/route.ts)"
    );
  });

  it("detects duplicate ownership", () => {
    const root = fixtureRoot();
    writeRoute(root, "app/api/projects/route.ts", "export function GET() {}");
    const owner = contract("app/api/projects/route.ts", ["GET"]);

    const report = auditRouteCoverage({ root, manifest: [owner, owner] });

    expect(report.structuralErrors).toContain(
      "Duplicate ownership: GET app/api/projects/route.ts"
    );
  });

  it("detects a nonexistent spec target", () => {
    const root = fixtureRoot();
    writeRoute(root, "app/api/projects/route.ts", "export function GET() {}");

    const report = auditRouteCoverage({
      root,
      manifest: [contract("app/api/projects/route.ts", ["GET"])],
    });

    expect(report.missingSpecs).toEqual([
      "__tests__/integration/projects/projects-contracts.spec.ts",
    ]);
    expect(report.uncovered).toEqual([
      "GET /api/projects -> __tests__/integration/projects/projects-contracts.spec.ts",
    ]);
  });

  it("does not accept a spec without a coverage declaration", () => {
    const root = fixtureRoot();
    const spec = "__tests__/integration/projects/projects-contracts.spec.ts";
    writeRoute(root, "app/api/projects/route.ts", "export function GET() {}");
    writeSpec(root, spec, "describe('projects', () => {});");

    const report = auditRouteCoverage({
      root,
      manifest: [contract("app/api/projects/route.ts", ["GET"])],
    });

    expect(report.declarationErrors).toContain(
      `Missing BACKEND_ROUTE_COVERAGE export: ${spec}`
    );
    expect(report.uncovered).toEqual([`GET /api/projects -> ${spec}`]);
  });

  it("does not accept an empty coverage declaration", () => {
    const root = fixtureRoot();
    const spec = "__tests__/integration/projects/projects-contracts.spec.ts";
    writeRoute(root, "app/api/projects/route.ts", "export function GET() {}");
    writeSpec(root, spec, "export const BACKEND_ROUTE_COVERAGE = [] as const;");

    const report = auditRouteCoverage({
      root,
      manifest: [contract("app/api/projects/route.ts", ["GET"])],
    });

    expect(report.declarationErrors).toContain(
      `BACKEND_ROUTE_COVERAGE must not be empty: ${spec}`
    );
    expect(report.uncovered).toEqual([`GET /api/projects -> ${spec}`]);
  });

  it("requires exact method and path declarations without stale tuples", () => {
    const root = fixtureRoot();
    const spec = "__tests__/integration/projects/projects-contracts.spec.ts";
    writeRoute(root, "app/api/projects/route.ts", "export function GET() {}");
    writeSpec(
      root,
      spec,
      'export const BACKEND_ROUTE_COVERAGE = [["POST", "/api/projects"]] as const;'
    );

    const report = auditRouteCoverage({
      root,
      manifest: [contract("app/api/projects/route.ts", ["GET"])],
    });

    expect(report.declarationErrors).toEqual(
      expect.arrayContaining([
        `Missing coverage declaration: GET /api/projects -> ${spec}`,
        `Stale coverage declaration: POST /api/projects -> ${spec}`,
      ])
    );
    expect(report.uncovered).toEqual([`GET /api/projects -> ${spec}`]);
  });

  it("accepts a nonempty exact coverage declaration", () => {
    const root = fixtureRoot();
    const spec = "__tests__/integration/projects/projects-contracts.spec.ts";
    writeRoute(root, "app/api/projects/route.ts", "export function GET() {}");
    writeSpec(
      root,
      spec,
      'export const BACKEND_ROUTE_COVERAGE = [["GET", "/api/projects"]] as const;'
    );

    const report = auditRouteCoverage({
      root,
      manifest: [contract("app/api/projects/route.ts", ["GET"])],
    });

    expect(report.declarationErrors).toEqual([]);
    expect(report.uncovered).toEqual([]);
  });

  it("rejects stale, malformed, and duplicate tuples beside expected coverage", () => {
    const root = fixtureRoot();
    const spec = "__tests__/integration/projects/projects-contracts.spec.ts";
    writeRoute(root, "app/api/projects/route.ts", "export function GET() {}");
    writeSpec(
      root,
      spec,
      [
        "export const BACKEND_ROUTE_COVERAGE = [",
        '  ["GET", "/api/projects"],',
        '  ["GET", "/api/projects"],',
        '  ["POST", "/api/projects"],',
        '  ["GET"],',
        "] as const;",
      ].join("\n")
    );

    const report = auditRouteCoverage({
      root,
      manifest: [contract("app/api/projects/route.ts", ["GET"])],
    });

    expect(report.uncovered).toEqual([]);
    expect(report.declarationErrors).toEqual(
      expect.arrayContaining([
        `Duplicate coverage declaration: GET /api/projects -> ${spec}`,
        `Stale coverage declaration: POST /api/projects -> ${spec}`,
        `Malformed BACKEND_ROUTE_COVERAGE tuple 3: ${spec}`,
      ])
    );
    expect(() => assertRouteCoverage(report)).toThrow(
      "Route coverage gate failed"
    );
  });

  it("detects a stale manifest entry", () => {
    const root = fixtureRoot();

    const report = auditRouteCoverage({
      root,
      manifest: [contract("app/api/projects/route.ts", ["GET"])],
    });

    expect(report.structuralErrors).toContain(
      "Stale manifest entry: GET app/api/projects/route.ts"
    );
  });

  it("detects an undocumented or disallowed exclusion", () => {
    const root = fixtureRoot();
    writeRoute(root, "app/api/health/route.ts", "export function GET() {}");
    const invalid = contract("app/api/health/route.ts", ["GET"], {
      module: "operations",
      spec: null,
      exclusions: [
        { methods: ["GET"], category: "misc", reason: "" },
      ] as unknown as RouteContract["exclusions"],
    });

    const report = auditRouteCoverage({ root, manifest: [invalid] });

    expect(report.structuralErrors).toContain(
      "Undocumented exclusion: GET app/api/health/route.ts"
    );
  });

  it("rejects an allowed exclusion category on a business route", () => {
    const root = fixtureRoot();
    writeRoute(root, "app/api/projects/route.ts", "export function GET() {}");
    const invalid = contract("app/api/projects/route.ts", ["GET"], {
      spec: null,
      exclusions: [
        {
          methods: ["GET"],
          category: "health probe",
          reason: "This business endpoint is not an authorized health probe.",
        },
      ],
    });

    const report = auditRouteCoverage({ root, manifest: [invalid] });

    expect(report.structuralErrors).toContain(
      "Unauthorized route exclusion: GET /api/projects (health probe)"
    );
  });

  it("detects route file and method count mismatches", () => {
    const root = fixtureRoot();
    writeRoute(root, "app/api/projects/route.ts", "export function GET() {}");

    const report = auditRouteCoverage({
      root,
      manifest: [contract("app/api/projects/route.ts", ["GET"])],
      expectedRouteFileCount: 2,
      expectedMethodCount: 3,
    });

    expect(report.structuralErrors).toEqual(
      expect.arrayContaining([
        "Route file count mismatch: expected 2, discovered 1",
        "Route method count mismatch: expected 3, discovered 1",
      ])
    );
  });

  it("detects method and path collisions after route-group normalization", () => {
    const root = fixtureRoot();
    writeRoute(
      root,
      "app/api/(internal)/status/route.ts",
      "export function GET() {}"
    );
    writeRoute(
      root,
      "app/api/(public)/status/route.ts",
      "export function GET() {}"
    );

    const report = auditRouteCoverage({ root, manifest: [] });

    expect(report.structuralErrors).toContain(
      "Duplicate normalized route handler: GET /api/status (app/api/(internal)/status/route.ts, app/api/(public)/status/route.ts)"
    );
  });
});

describe("filesystem boundaries", () => {
  it("fails loudly when app/api is missing", () => {
    const root = fixtureRoot({ api: false });

    expect(() => discoverApiRoutes(root)).toThrow(
      `API route root not found: ${path.join(root, "app", "api")}`
    );
  });

  it("resolves the repository root from a nested directory", () => {
    const root = fixtureRoot();
    const nested = path.join(root, "tools", "nested");
    mkdirSync(nested, { recursive: true });

    expect(resolveRepositoryRoot(nested)).toBe(root);
  });

  it("rejects symlinked API route directories", () => {
    const root = fixtureRoot();
    const target = path.join(root, "linked-routes");
    mkdirSync(target, { recursive: true });
    writeFileSync(path.join(target, "route.ts"), "export function GET() {}", "utf8");
    symlinkSync(target, path.join(root, "app", "api", "linked"), "junction");

    expect(() => discoverApiRoutes(root)).toThrow(
      "Symbolic links are not allowed in API route inventory: app/api/linked"
    );
  });
});

describe("repository route manifest", () => {
  it("matches the filesystem inventory exactly", () => {
    const report = auditRouteCoverage({
      manifest: routeManifest,
      expectedRouteFileCount: 85,
      expectedMethodCount: 129,
    });

    expect(report.routeFileCount).toBe(85);
    expect(report.methodCount).toBe(129);
    expect(report.structuralErrors).toEqual([]);
  });

  it("has no methods waiting on planned integration specs", () => {
    const report = auditRouteCoverage({
      manifest: routeManifest,
      expectedRouteFileCount: 85,
      expectedMethodCount: 129,
    });

    expect(report.declarationErrors).toEqual([]);
    expect(report.uncovered).toEqual([]);
  });
});
