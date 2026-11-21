interface JsonResponse {
  headers(): Record<string, string>;
  json(): Promise<unknown>;
}

const RECORD_FIELDS = ["participant", "source", "document"] as const;
const RECORD_ARRAY_FIELDS = ["participants", "sources"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidContract(context: string): never {
  throw new Error(`${context}: invalid JSON response contract`);
}

export function normalizeSemanticWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

export async function readTask8JsonBody(
  response: JsonResponse,
  context: string
): Promise<Record<string, unknown>> {
  const contentType = response.headers()["content-type"] ?? "<missing>";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(
      `${context}: expected application/json content-type, received ${contentType}`
    );
  }

  let value: unknown;
  try {
    value = await response.json();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${context}: response body is not valid JSON: ${detail}`);
  }

  if (!isRecord(value)) {
    throw new Error(`${context}: expected a JSON object`);
  }

  if (
    ("ok" in value && typeof value.ok !== "boolean") ||
    ("error" in value && typeof value.error !== "string")
  ) {
    invalidContract(context);
  }

  for (const field of RECORD_FIELDS) {
    if (field in value && !isRecord(value[field])) invalidContract(context);
  }

  for (const field of RECORD_ARRAY_FIELDS) {
    if (
      field in value &&
      (!Array.isArray(value[field]) || !value[field].every(isRecord))
    ) {
      invalidContract(context);
    }
  }

  return value;
}
