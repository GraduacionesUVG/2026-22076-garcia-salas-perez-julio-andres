import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { HTTP_METHODS, type HttpMethod, type RouteContract } from "./route-manifest";
import {
  nonPersistingWorkflowAiActions,
  type BackendActionContract,
  type FrontendActionExclusion,
} from "./action-manifest";
import { resolveRepositoryRoot } from "./route-coverage";

export interface FrontendApiCallSite {
  file: `features/${string}`;
  symbol: string;
  method: HttpMethod;
  canonicalPath: string;
}

export class FrontendApiDiscoveryError extends Error {
  constructor(message: string, readonly knownSites: readonly FrontendApiCallSite[]) {
    super(message);
    this.name = "FrontendApiDiscoveryError";
  }
}

interface SourceUnit { file: FrontendApiCallSite["file"]; source: ts.SourceFile }
type FunctionNode = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | ts.MethodDeclaration;
interface FunctionEntry { node: FunctionNode; file: string }

export function canonicalApiPath(value: string): string {
  const pathOnly = value.split(/[?#]/u, 1)[0].replace(/\/+$/u, "");
  return pathOnly.replace(/:[A-Za-z][A-Za-z0-9_.-]*(?:\*\??)?/gu, ":*") || "/api";
}

function featureFiles(root: string, directory = path.join(root, "features")): string[] {
  if (!existsSync(directory)) throw new Error(`Feature source root not found: ${directory}`);
  if (lstatSync(directory).isSymbolicLink()) throw new Error(`Symlink in feature source: ${directory}`);
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlink in feature source: ${absolute}`);
    if (entry.isDirectory()) return featureFiles(root, absolute);
    return entry.isFile() && /\.(?:js|jsx|ts|tsx)$/u.test(entry.name) ? [absolute] : [];
  });
}

function unwrap(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isSatisfiesExpression(current)) {
    current = current.expression;
  }
  return current;
}

function property(object: ts.ObjectLiteralExpression, name: string): ts.Expression | null {
  for (const member of object.properties) {
    if (ts.isPropertyAssignment(member) && (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)) && member.name.text === name) return member.initializer;
    if (ts.isShorthandPropertyAssignment(member) && member.name.text === name) return member.name;
  }
  return null;
}

function returnedExpressions(node: FunctionNode): ts.Expression[] {
  if (!node.body) return [];
  if (!ts.isBlock(node.body)) return [node.body];
  const found: ts.Expression[] = [];
  const visit = (child: ts.Node): void => {
    if (ts.isFunctionLike(child) && child !== node) return;
    if (ts.isReturnStatement(child)) {
      if (child.expression) found.push(child.expression);
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node.body);
  return found;
}

function isExported(node: ts.Node): boolean {
  return ts.canHaveModifiers(node) && Boolean(ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function enclosingSymbol(node: ts.Node): string {
  let current: ts.Node | undefined = node;
  while (current) {
    if (ts.isFunctionDeclaration(current) && current.name) return current.name.text;
    if ((ts.isArrowFunction(current) || ts.isFunctionExpression(current)) && current.parent) {
      const parent = current.parent;
      if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
      if (ts.isPropertyAssignment(parent)) return parent.name.getText();
    }
    if (ts.isMethodDeclaration(current)) return current.name.getText();
    current = current.parent;
  }
  return "<module>";
}

export function discoverFrontendApiCallSites(root: string): FrontendApiCallSite[] {
  const units: SourceUnit[] = featureFiles(root).sort().map((absolute) => {
    const file = path.relative(root, absolute).replaceAll("\\", "/") as FrontendApiCallSite["file"];
    const kind = /\.tsx?$/u.test(file) ? (file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS) : (file.endsWith("x") ? ts.ScriptKind.JSX : ts.ScriptKind.JS);
    return { file, source: ts.createSourceFile(file, readFileSync(absolute, "utf8"), ts.ScriptTarget.Latest, true, kind) };
  });
  const functions = new Map<string, FunctionEntry[]>();
  const addFunction = (name: string, node: FunctionNode, file: string): void => {
    functions.set(name, [...(functions.get(name) ?? []), { node, file }]);
  };
  for (const unit of units) {
    const visit = (node: ts.Node): void => {
      if (ts.isFunctionDeclaration(node) && node.name) addFunction(node.name.text, node, unit.file);
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        const value = unwrap(node.initializer);
        if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) addFunction(node.name.text, value, unit.file);
      }
      ts.forEachChild(node, visit);
    };
    visit(unit.source);
  }

  function initializerFor(identifier: ts.Identifier): ts.Expression | null {
    const isBound = (name: ts.BindingName): boolean =>
      ts.isIdentifier(name)
        ? name.text === identifier.text
        : name.elements.some((element) => ts.isBindingElement(element) && isBound(element.name));
    let current: ts.Node | undefined = identifier.parent;
    while (current) {
      if (ts.isBlock(current) || ts.isSourceFile(current)) {
        for (const statement of current.statements) {
          if (!ts.isVariableStatement(statement)) continue;
          for (const declaration of statement.declarationList.declarations) {
            if (isBound(declaration.name)) {
              // A destructuring initializer is the container, not this binding's value.
              return ts.isIdentifier(declaration.name) ? declaration.initializer ?? null : null;
            }
          }
        }
      }
      if (ts.isFunctionLike(current) && current.parameters.some((parameter) => isBound(parameter.name))) return null;
      current = current.parent;
    }
    return null;
  }

  interface EvaluatedVariants { values: string[]; unresolved: boolean }
  const unresolved = (): EvaluatedVariants => ({ values: [], unresolved: true });
  const known = (value: string): EvaluatedVariants => ({ values: [value], unresolved: false });

  function evaluateVariants(expression: ts.Expression, file: string, seen = new Set<string>()): EvaluatedVariants {
    const value = unwrap(expression);
    if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) return known(value.text);
    if (ts.isTemplateExpression(value)) {
      let results = [value.head.text];
      let hasUnresolvedBranch = false;
      for (const span of value.templateSpans) {
        const evaluated = evaluateVariants(span.expression, file, seen);
        const parts = evaluated.values.length ? evaluated.values : [":*"];
        if (evaluated.values.length && evaluated.unresolved) hasUnresolvedBranch = true;
        results = results.flatMap((prefix) => parts.map((part) => {
          const normalized = part === "" || part.startsWith("/api/") || part.startsWith("?") || part === ":*" ? part : ":*";
          return prefix + normalized + span.literal.text;
        }));
      }
      return { values: results, unresolved: hasUnresolvedBranch };
    }
    if (ts.isBinaryExpression(value) && value.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = evaluateVariants(value.left, file, seen);
      const right = evaluateVariants(value.right, file, seen);
      return { values: left.values.flatMap((a) => right.values.map((b) => a + b)), unresolved: left.unresolved || right.unresolved };
    }
    if (ts.isConditionalExpression(value)) {
      const left = evaluateVariants(value.whenTrue, file, seen);
      const right = evaluateVariants(value.whenFalse, file, seen);
      return { values: [...left.values, ...right.values], unresolved: left.unresolved || right.unresolved };
    }
    if (ts.isIdentifier(value)) {
      const initializer = initializerFor(value);
      const key = `${file}:identifier:${value.text}`;
      return initializer && !seen.has(key)
        ? evaluateVariants(initializer, file, new Set([...seen, key]))
        : unresolved();
    }
    if (ts.isCallExpression(value) && ts.isIdentifier(value.expression)) {
      const name = value.expression.text;
      if (name === "buildQueryString") return known("");
      if (name === "encodeURIComponent" || name === "encodePathValue") return known(":*");
      const entries = functions.get(name) ?? [];
      const entry = entries.find((candidate) => candidate.file === file) ?? entries[0];
      const key = `${entry?.file}:function:${name}`;
      if (!entry || seen.has(key)) return unresolved();
      const returned = returnedExpressions(entry.node);
      if (!returned.length) return unresolved();
      const variants = returned.map((item) => evaluateVariants(item, entry.file, new Set([...seen, key])));
      return { values: variants.flatMap((item) => item.values), unresolved: variants.some((item) => item.unresolved) };
    }
    return unresolved();
  }

  const sites: FrontendApiCallSite[] = [];
  const add = (file: FrontendApiCallSite["file"], symbol: string, method: HttpMethod, rawPath: string | null): void => {
    if (!rawPath?.startsWith("/api/")) return;
    sites.push({ file, symbol, method, canonicalPath: canonicalApiPath(rawPath) });
  };
  const addExpression = (file: FrontendApiCallSite["file"], symbol: string, method: HttpMethod, expression: ts.Expression, context: string): void => {
    const variants = evaluateVariants(expression, file);
    for (const variant of variants.values) add(file, symbol, method, variant);
    if (variants.unresolved || !variants.values.length) {
      throw new FrontendApiDiscoveryError(`Unresolved ${context} URL: ${file}:${expression.getStart()}`, [...sites]);
    }
  };
  const addExportedReturns = (file: FrontendApiCallSite["file"], symbol: string, node: FunctionNode): void => {
    const variants = returnedExpressions(node).map((expression) => evaluateVariants(expression, file));
    const knownApi = variants.flatMap((result) => result.values).filter((candidate) => candidate.startsWith("/api/"));
    for (const candidate of knownApi) add(file, symbol, "GET", candidate);
    if (knownApi.length && variants.some((result) => result.unresolved || !result.values.length)) {
      throw new FrontendApiDiscoveryError(`Unresolved exported API URL: ${file}#${symbol}`, [...sites]);
    }
  };
  const methodFor = (options: ts.Expression | undefined, file: string, seen = new Set<string>()): HttpMethod => {
    if (!options) return "GET";
    const value = unwrap(options);
    if (value.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(value) && value.text === "undefined")) return "GET";
    if (ts.isIdentifier(value)) {
      const initializer = initializerFor(value);
      const key = `${file}:options:${value.text}`;
      if (initializer && !seen.has(key)) return methodFor(initializer, file, new Set([...seen, key]));
      throw new Error(`Unresolved request options: ${file}:${value.getStart()}`);
    }
    if (ts.isObjectLiteralExpression(value)) {
      if (value.properties.some(ts.isSpreadAssignment)) throw new Error(`Unresolved request options spread: ${file}:${value.getStart()}`);
      const method = property(value, "method");
      if (method) {
        const result = evaluateVariants(method, file);
        if (!result.unresolved && result.values.length === 1 && HTTP_METHODS.includes(result.values[0] as HttpMethod)) return result.values[0] as HttpMethod;
        throw new Error(`Unresolved request method: ${file}:${method.getStart()}`);
      }
      return "GET";
    }
    if (ts.isCallExpression(value) && ts.isIdentifier(value.expression) && value.expression.text === "jsonOptions") {
      const result = value.arguments[0] && evaluateVariants(value.arguments[0], file);
      if (result && !result.unresolved && result.values.length === 1 && HTTP_METHODS.includes(result.values[0] as HttpMethod)) return result.values[0] as HttpMethod;
      throw new Error(`Unresolved request method: ${file}:${value.getStart()}`);
    }
    throw new Error(`Unresolved request options: ${file}:${value.getStart()}`);
  };

  for (const unit of units) {
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const name = node.expression.text;
        if ((name === "fetch" || name === "requestJson") && node.arguments[0]) {
          addExpression(unit.file, enclosingSymbol(node), methodFor(node.arguments[1], unit.file), node.arguments[0], name);
        }
      }
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === "assign" && node.expression.expression.getText(unit.source) === "window.location" && node.arguments[0]) {
        addExpression(unit.file, `${enclosingSymbol(node)}.download`, "GET", node.arguments[0], "download");
      }
      if (ts.isPropertyAssignment(node) && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) && node.name.text === "api") {
        addExpression(unit.file, enclosingSymbol(node), "POST", node.initializer, "AI api");
      }
      if (ts.isFunctionDeclaration(node) && node.name && isExported(node)) {
        addExportedReturns(unit.file, node.name.text, node);
      }
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer &&
          ts.isVariableStatement(node.parent.parent) && isExported(node.parent.parent)) {
        const value = unwrap(node.initializer);
        if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) {
          addExportedReturns(unit.file, node.name.text, value);
        }
      }
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "createProjectExportAction") {
        const options = node.arguments[0] && unwrap(node.arguments[0]);
        if (options && ts.isObjectLiteralExpression(options)) {
          const exportType = property(options, "exportType");
          const types = exportType && evaluateVariants(exportType, unit.file);
          if (types?.unresolved || (types && !types.values.length)) {
            throw new FrontendApiDiscoveryError(`Unresolved project export type: ${unit.file}:${node.getStart()}`, [...sites]);
          }
          for (const type of types?.values ?? []) add(unit.file, `${enclosingSymbol(node)}.export.${type}`, "GET", "/api/projects/:*/exports/:*");
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(unit.source);
  }
  const occurrences = new Map<string, number>();
  return sites.map((site) => {
    const key = `${site.file}:${site.symbol}`;
    const count = (occurrences.get(key) ?? 0) + 1;
    occurrences.set(key, count);
    return count === 1 ? site : { ...site, symbol: `${site.symbol}.call${count}` };
  })
    .sort((a, b) => `${a.file}:${a.symbol}:${a.method}:${a.canonicalPath}`.localeCompare(`${b.file}:${b.symbol}:${b.method}:${b.canonicalPath}`));
}

export function validateActionManifest({
  root = resolveRepositoryRoot(), discovered, actions, routeManifest, exclusions = [],
}: {
  root?: string;
  discovered: readonly FrontendApiCallSite[];
  actions: readonly BackendActionContract[];
  routeManifest: readonly RouteContract[];
  exclusions?: readonly FrontendActionExclusion[];
}): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const sourceOwners = new Map<string, string>();
  const coveredSites = new Set<FrontendApiCallSite>();
  const discoveredBySource = new Map<string, FrontendApiCallSite[]>();
  const sourceKey = (file: string, symbol: string) => `${file}#${symbol}`;
  for (const site of discovered) {
    const key = sourceKey(site.file, site.symbol);
    discoveredBySource.set(key, [...(discoveredBySource.get(key) ?? []), site]);
  }
  const persistenceExceptionIds = new Set(
    actions
      .filter((action) => action.persistenceException === "streaming-ai-no-durable-write")
      .map((action) => action.id)
  );
  if (
    persistenceExceptionIds.size > 0 && (
    persistenceExceptionIds.size !== nonPersistingWorkflowAiActions.size ||
    [...persistenceExceptionIds].some((id) => !nonPersistingWorkflowAiActions.has(id))
    )
  ) {
    errors.push(
      `Persistence exception inventory mismatch: expected ${[...nonPersistingWorkflowAiActions].join(",")}`
    );
  }
  const own = (file: string, symbol: string, owner: string, route?: readonly [HttpMethod, string]): void => {
    const key = sourceKey(file, symbol);
    if (sourceOwners.has(key)) errors.push(`Duplicate source ownership: ${key} (${sourceOwners.get(key)}, ${owner})`);
    sourceOwners.set(key, owner);
    const sites = discoveredBySource.get(key);
    if (!sites) errors.push(`Missing source symbol: ${key}`);
    else if (route) {
      const matches = sites.filter((site) => site.method === route[0] && site.canonicalPath === canonicalApiPath(route[1]));
      if (!matches.length) errors.push(`Source route mismatch: ${key} expected ${route[0]} ${route[1]}`);
      for (const site of matches) coveredSites.add(site);
    } else if (sites) {
      for (const site of sites) coveredSites.add(site);
    }
  };
  for (const action of actions) {
    if (ids.has(action.id)) errors.push(`Duplicate action ID: ${action.id}`);
    ids.add(action.id);
    if (!/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/u.test(action.id)) errors.push(`Invalid action ID: ${action.id}`);
    if (!action.sources.length) errors.push(`Action has no source: ${action.id}`);
    for (const source of action.sources) own(source.file, source.symbol, action.id, action.route);
    const route = routeManifest.find((candidate) => candidate.methods.includes(action.route[0]) && canonicalApiPath(candidate.path) === canonicalApiPath(action.route[1]));
    if (!route) errors.push(`Unknown route tuple: ${action.id} ${action.route.join(" ")}`);
    if (route?.spec !== action.spec) errors.push(`Integration spec mismatch: ${action.id}`);
    if (!existsSync(path.join(root, action.spec))) errors.push(`Missing integration spec: ${action.id} ${action.spec}`);
    if (action.presentation === "out-of-scope" && !action.outOfScopeReason?.trim()) errors.push(`Missing out-of-scope reason: ${action.id}`);
    const required = new Set(action.required);
    if (
      action.persistenceException === "streaming-ai-no-durable-write" &&
      !nonPersistingWorkflowAiActions.has(action.id)
    ) {
      errors.push(`Unapproved persistence exception: ${action.id}`);
    }
    const defaultRequired = action.route[0] === "GET" || action.route[0] === "HEAD"
      ? ["success", "permissions"]
      : action.persistenceException === "streaming-ai-no-durable-write"
        ? ["success", "permissions", "validation", "dependency-failure", "cleanup"]
        : ["success", "persistence", "permissions", "validation", "cleanup"];
    for (const dimension of defaultRequired) {
      if (!required.has(dimension as BackendActionContract["required"][number])) errors.push(`Missing required ${dimension} evidence: ${action.id}`);
    }
    if (/(?:create|link|version|restore|invite|coding)/u.test(action.id) && action.route[0] !== "GET" && !required.has("duplicate") && !required.has("concurrency")) {
      errors.push(`Missing duplicate/concurrency evidence: ${action.id}`);
    }
  }
  for (const exclusion of exclusions) {
    if (!exclusion.reason.trim()) errors.push(`Missing exclusion reason: ${exclusion.file}#${exclusion.symbol}`);
    own(exclusion.file, exclusion.symbol, `exclusion:${exclusion.reason}`, [exclusion.method, exclusion.canonicalPath]);
  }
  for (const site of discovered) {
    if (!coveredSites.has(site)) errors.push(`Unowned frontend API call: ${site.file}#${site.symbol} ${site.method} ${site.canonicalPath}`);
  }
  return errors.sort();
}
