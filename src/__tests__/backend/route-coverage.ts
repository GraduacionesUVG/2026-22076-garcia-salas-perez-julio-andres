import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import {
  ALLOWED_EXCLUSION_CATEGORIES,
  AUTHORIZED_ROUTE_EXCLUSIONS,
  HTTP_METHODS,
  normalizeRoutePath,
  type ApiPath,
  type HttpMethod,
  type RouteContract,
  type RouteFile,
} from "./route-manifest";

export { normalizeRoutePath } from "./route-manifest";

export interface DiscoveredRoute {
  readonly file: RouteFile;
  readonly path: string;
  readonly methods: readonly HttpMethod[];
}

export interface RouteCoverageReport {
  readonly routes: readonly DiscoveredRoute[];
  readonly routeFileCount: number;
  readonly methodCount: number;
  readonly structuralErrors: readonly string[];
  readonly declarationErrors: readonly string[];
  readonly missingSpecs: readonly string[];
  readonly uncovered: readonly string[];
}

export interface RouteCoverageOptions {
  readonly root?: string;
  readonly manifest: readonly RouteContract[];
  readonly expectedRouteFileCount?: number;
  readonly expectedMethodCount?: number;
}

const methodSet = new Set<string>(HTTP_METHODS);
const exclusionCategorySet = new Set<string>(ALLOWED_EXCLUSION_CATEGORIES);
const authorizedExclusionSet = new Set<string>(
  AUTHORIZED_ROUTE_EXCLUSIONS.map(
    ({ path: routePath, method, category }) =>
      `${method} ${routePath} ${category}`
  )
);

export function resolveRepositoryRoot(start = process.cwd()): string {
  let candidate = path.resolve(start);

  while (true) {
    if (
      existsSync(path.join(candidate, "package.json")) &&
      existsSync(path.join(candidate, "app", "api"))
    ) {
      return candidate;
    }
    const parent = path.dirname(candidate);
    if (parent === candidate) {
      throw new Error(`Repository root not found from: ${path.resolve(start)}`);
    }
    candidate = parent;
  }
}

function routeFiles(root: string, directory: string): string[] {
  if (lstatSync(directory).isSymbolicLink()) {
    throw new Error(
      `Symbolic links are not allowed in API route inventory: ${path
        .relative(root, directory)
        .replaceAll("\\", "/")}`
    );
  }

  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(
        `Symbolic links are not allowed in API route inventory: ${path
          .relative(root, entryPath)
          .replaceAll("\\", "/")}`
      );
    }
    if (entry.isDirectory()) files.push(...routeFiles(root, entryPath));
    if (entry.isFile() && entry.name === "route.ts") files.push(entryPath);
  }
  return files;
}

function hasExportModifier(node: ts.Node): boolean {
  return ts.canHaveModifiers(node)
    ? Boolean(
        ts
          .getModifiers(node)
          ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
      )
    : false;
}

function exportedMethods(file: string, relativeFile: RouteFile): HttpMethod[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const exportCounts = new Map<HttpMethod, number>();

  const add = (name: string): void => {
    if (!methodSet.has(name)) return;
    const method = name as HttpMethod;
    exportCounts.set(method, (exportCounts.get(method) ?? 0) + 1);
  };

  for (const statement of source.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      statement.body &&
      hasExportModifier(statement)
    ) {
      add(statement.name.text);
    }

    if (ts.isVariableStatement(statement) && hasExportModifier(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) add(declaration.name.text);
      }
    }

    if (
      ts.isExportDeclaration(statement) &&
      !statement.isTypeOnly &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) {
        if (!element.isTypeOnly) add(element.name.text);
      }
    }
  }

  for (const method of HTTP_METHODS) {
    if ((exportCounts.get(method) ?? 0) > 1) {
      throw new Error(
        `Duplicate HTTP handler export: ${method} ${relativeFile}`
      );
    }
  }
  return HTTP_METHODS.filter((method) => exportCounts.has(method));
}

export function discoverApiRoutes(root: string): DiscoveredRoute[] {
  const repositoryRoot = path.resolve(root);
  const apiRoot = path.join(repositoryRoot, "app", "api");
  if (!existsSync(apiRoot)) {
    throw new Error(`API route root not found: ${apiRoot}`);
  }
  if (!lstatSync(apiRoot).isDirectory()) {
    throw new Error(`API route root is not a directory: ${apiRoot}`);
  }

  return routeFiles(repositoryRoot, apiRoot)
    .sort((left, right) => left.localeCompare(right))
    .map((absoluteFile) => {
      const file = path
        .relative(repositoryRoot, absoluteFile)
        .replaceAll("\\", "/") as RouteFile;
      return {
        file,
        path: normalizeRoutePath(file),
        methods: exportedMethods(absoluteFile, file),
      };
    });
}

interface DeclaredCoverage {
  readonly method: HttpMethod;
  readonly path: ApiPath;
}

interface ParsedCoverageDeclaration {
  readonly tuples: ReadonlyMap<string, DeclaredCoverage>;
  readonly errors: readonly string[];
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function literalText(expression: ts.Expression): string | null {
  const value = unwrapExpression(expression);
  return ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)
    ? value.text
    : null;
}

function coverageTupleKey(method: HttpMethod, routePath: ApiPath): string {
  return `${method} ${routePath}`;
}

function parseCoverageDeclaration(
  absoluteSpec: string,
  spec: string
): ParsedCoverageDeclaration {
  const source = ts.createSourceFile(
    absoluteSpec,
    readFileSync(absoluteSpec, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const declarations: ts.VariableDeclaration[] = [];

  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement) || !hasExportModifier(statement)) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === "BACKEND_ROUTE_COVERAGE"
      ) {
        declarations.push(declaration);
      }
    }
  }

  if (declarations.length === 0) {
    return {
      tuples: new Map(),
      errors: [`Missing BACKEND_ROUTE_COVERAGE export: ${spec}`],
    };
  }
  if (declarations.length > 1) {
    return {
      tuples: new Map(),
      errors: [`Duplicate BACKEND_ROUTE_COVERAGE export: ${spec}`],
    };
  }

  const initializer = declarations[0].initializer
    ? unwrapExpression(declarations[0].initializer)
    : null;
  if (!initializer || !ts.isArrayLiteralExpression(initializer)) {
    return {
      tuples: new Map(),
      errors: [`Malformed BACKEND_ROUTE_COVERAGE export: ${spec}`],
    };
  }

  const tuples = new Map<string, DeclaredCoverage>();
  const errors: string[] = [];
  if (initializer.elements.length === 0) {
    errors.push(`BACKEND_ROUTE_COVERAGE must not be empty: ${spec}`);
  }

  initializer.elements.forEach((element, index) => {
    const tuple = ts.isExpression(element) ? unwrapExpression(element) : null;
    if (!tuple || !ts.isArrayLiteralExpression(tuple) || tuple.elements.length !== 2) {
      errors.push(`Malformed BACKEND_ROUTE_COVERAGE tuple ${index}: ${spec}`);
      return;
    }
    const method = literalText(tuple.elements[0] as ts.Expression);
    const routePath = literalText(tuple.elements[1] as ts.Expression);
    if (
      !method ||
      !methodSet.has(method) ||
      !routePath ||
      (routePath !== "/api" && !routePath.startsWith("/api/"))
    ) {
      errors.push(`Malformed BACKEND_ROUTE_COVERAGE tuple ${index}: ${spec}`);
      return;
    }

    const declared = {
      method: method as HttpMethod,
      path: routePath as ApiPath,
    };
    const tupleKey = coverageTupleKey(declared.method, declared.path);
    if (tuples.has(tupleKey)) {
      errors.push(
        `Duplicate coverage declaration: ${declared.method} ${declared.path} -> ${spec}`
      );
      return;
    }
    tuples.set(tupleKey, declared);
  });

  return { tuples, errors };
}

function key(file: string, method: HttpMethod): string {
  return `${method} ${file}`;
}

export function auditRouteCoverage({
  root,
  manifest,
  expectedRouteFileCount,
  expectedMethodCount,
}: RouteCoverageOptions): RouteCoverageReport {
  const repositoryRoot = root ? path.resolve(root) : resolveRepositoryRoot();
  const routes = discoverApiRoutes(repositoryRoot);
  const routeFileCount = routes.length;
  const methodCount = routes.reduce(
    (count, route) => count + route.methods.length,
    0
  );
  const structuralErrors: string[] = [];
  const declarationErrors: string[] = [];
  const missingSpecs = new Set<string>();
  const uncovered = new Set<string>();
  const discovered = new Map<string, DiscoveredRoute>();
  const normalizedHandlers = new Map<string, string[]>();
  const ownership = new Set<string>();
  const expectedBySpec = new Map<string, Map<string, DeclaredCoverage>>();

  for (const route of routes) {
    for (const method of route.methods) {
      discovered.set(key(route.file, method), route);
      const normalizedKey = `${method} ${route.path}`;
      const files = normalizedHandlers.get(normalizedKey) ?? [];
      files.push(route.file);
      normalizedHandlers.set(normalizedKey, files);
    }
  }

  for (const [normalizedKey, files] of normalizedHandlers) {
    if (files.length > 1) {
      structuralErrors.push(
        `Duplicate normalized route handler: ${normalizedKey} (${files.join(", ")})`
      );
    }
  }

  if (
    expectedRouteFileCount !== undefined &&
    routeFileCount !== expectedRouteFileCount
  ) {
    structuralErrors.push(
      `Route file count mismatch: expected ${expectedRouteFileCount}, discovered ${routeFileCount}`
    );
  }
  if (expectedMethodCount !== undefined && methodCount !== expectedMethodCount) {
    structuralErrors.push(
      `Route method count mismatch: expected ${expectedMethodCount}, discovered ${methodCount}`
    );
  }

  for (const contract of manifest) {
    let normalizedPath: string | null = null;
    try {
      normalizedPath = normalizeRoutePath(contract.file);
      if (contract.path !== normalizedPath) {
        structuralErrors.push(
          `Manifest path mismatch: ${contract.path} should be ${normalizedPath} (${contract.file})`
        );
      }
    } catch (error) {
      structuralErrors.push(
        error instanceof Error ? error.message : `Invalid route file: ${contract.file}`
      );
    }

    const exclusionsByMethod = new Map<HttpMethod, number>();
    for (const exclusion of contract.exclusions) {
      const validDocumentation =
        exclusionCategorySet.has(exclusion.category) &&
        exclusion.reason.trim().length >= 12 &&
        exclusion.methods.length > 0;
      for (const method of exclusion.methods) {
        exclusionsByMethod.set(method, (exclusionsByMethod.get(method) ?? 0) + 1);
        if (!validDocumentation) {
          structuralErrors.push(
            `Undocumented exclusion: ${method} ${contract.file}`
          );
        }
        if (
          !normalizedPath ||
          !authorizedExclusionSet.has(
            `${method} ${normalizedPath} ${exclusion.category}`
          )
        ) {
          structuralErrors.push(
            `Unauthorized route exclusion: ${method} ${normalizedPath ?? contract.path} (${exclusion.category})`
          );
        }
        if (!contract.methods.includes(method)) {
          structuralErrors.push(
            `Exclusion targets undeclared method: ${method} ${contract.file}`
          );
        }
      }
    }

    const declaredMethods = new Set<HttpMethod>();
    for (const method of contract.methods) {
      const routeKey = key(contract.file, method);
      if (declaredMethods.has(method) || ownership.has(routeKey)) {
        structuralErrors.push(`Duplicate ownership: ${method} ${contract.file}`);
      }
      declaredMethods.add(method);
      ownership.add(routeKey);

      if (!discovered.has(routeKey)) {
        structuralErrors.push(`Stale manifest entry: ${method} ${contract.file}`);
      }

      const exclusionCount = exclusionsByMethod.get(method) ?? 0;
      if (contract.spec && exclusionCount > 0) {
        structuralErrors.push(
          `Method has spec and exclusion ownership: ${method} ${contract.file}`
        );
      } else if (!contract.spec && exclusionCount !== 1) {
        structuralErrors.push(
          `Undocumented exclusion: ${method} ${contract.file}`
        );
      } else if (exclusionCount > 1) {
        structuralErrors.push(
          `Duplicate exclusion ownership: ${method} ${contract.file}`
        );
      }

      if (contract.spec) {
        const routePath = (normalizedPath ?? contract.path) as ApiPath;
        const expected = expectedBySpec.get(contract.spec) ?? new Map();
        expected.set(coverageTupleKey(method, routePath), {
          method,
          path: routePath,
        });
        expectedBySpec.set(contract.spec, expected);
      }
    }
  }

  for (const route of routes) {
    for (const method of route.methods) {
      if (!ownership.has(key(route.file, method))) {
        structuralErrors.push(
          `Unowned route method: ${method} ${route.path} (${route.file})`
        );
      }
    }
  }

  for (const [spec, expected] of expectedBySpec) {
    const absoluteSpec = path.join(repositoryRoot, spec);
    if (!existsSync(absoluteSpec)) {
      missingSpecs.add(spec);
      for (const declaration of expected.values()) {
        uncovered.add(`${declaration.method} ${declaration.path} -> ${spec}`);
      }
      continue;
    }

    const parsed = parseCoverageDeclaration(absoluteSpec, spec);
    declarationErrors.push(...parsed.errors);
    for (const [tupleKey, declaration] of expected) {
      if (!parsed.tuples.has(tupleKey)) {
        declarationErrors.push(
          `Missing coverage declaration: ${declaration.method} ${declaration.path} -> ${spec}`
        );
        uncovered.add(`${declaration.method} ${declaration.path} -> ${spec}`);
      }
    }
    for (const [tupleKey, declaration] of parsed.tuples) {
      if (!expected.has(tupleKey)) {
        declarationErrors.push(
          `Stale coverage declaration: ${declaration.method} ${declaration.path} -> ${spec}`
        );
      }
    }
  }

  return {
    routes,
    routeFileCount,
    methodCount,
    structuralErrors: [...new Set(structuralErrors)].sort(),
    declarationErrors: [...new Set(declarationErrors)].sort(),
    missingSpecs: [...missingSpecs].sort(),
    uncovered: [...uncovered].sort(),
  };
}

export function assertRouteCoverage(report: RouteCoverageReport): void {
  const errors = [
    ...report.structuralErrors,
    ...report.declarationErrors,
    ...report.uncovered.map((entry) => `Uncovered route method: ${entry}`),
  ];
  if (errors.length > 0) {
    throw new Error(`Route coverage gate failed:\n${errors.join("\n")}`);
  }
}
