import type { EvidenceDimension } from "./action-manifest";

const dimensions = new Set<EvidenceDimension>([
  "success", "persistence", "permissions", "validation", "duplicate",
  "concurrency", "dependency-failure", "cleanup",
]);

export function actionEvidenceTitle(
  id: string,
  required: readonly EvidenceDimension[],
  label: string
): string {
  if (!/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/u.test(id)) {
    throw new Error(`Invalid action ID: ${id}`);
  }
  if (!required.length || required.some((dimension) => !dimensions.has(dimension))) {
    throw new Error(`Invalid action evidence dimensions: ${required.join(",")}`);
  }
  if (!/\S/u.test(label) || /[\r\n\u2028\u2029]/u.test(label) || label.includes(" | ")) {
    throw new Error("Invalid action evidence label");
  }
  return `ACTION ${id} [${required.join(",")}]: ${label}`;
}

export function parseActionEvidenceTitle(
  title: string
): { actionId: string; dimensions: EvidenceDimension[] } | null {
  if (/[\r\n\u2028\u2029]/u.test(title)) return null;
  if (title.includes(" | ")) return null;
  const match = /^ACTION ([a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+) \[([^\]]+)\]: (.+)$/u.exec(title);
  if (!match) return null;
  if (!/\S/u.test(match[3])) return null;
  const parsed = match[2].split(",") as EvidenceDimension[];
  if (parsed.some((dimension) => !dimensions.has(dimension))) return null;
  return { actionId: match[1], dimensions: parsed };
}

export function parseActionEvidenceSegments(title: string): Array<{ actionId: string; dimensions: EvidenceDimension[] }> | null {
  const segments = title.split(" | ").map(parseActionEvidenceTitle);
  return segments.every(segment => segment !== null) ? segments : null;
}
