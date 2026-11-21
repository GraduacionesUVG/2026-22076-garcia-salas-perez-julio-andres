export type HostilePayloadCaseName =
  | "whitespace"
  | "unicode"
  | "html"
  | "spreadsheet-formula"
  | "sql-like"
  | "oversized-string"
  | "null"
  | "array"
  | "number"
  | "boolean"
  | "unknown-object-key";

export interface HostilePayloadCase {
  readonly name: HostilePayloadCaseName;
  readonly value: unknown;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }

  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

export const HOSTILE_PAYLOAD_CASES: readonly HostilePayloadCase[] = deepFreeze([
  { name: "whitespace", value: " \t\r\n " },
  { name: "unicode", value: "Ixoqib' \u2022 \u6771\u4eac \u2022 \ud83e\uddea" },
  { name: "html", value: "<script>alert('qa')</script>" },
  { name: "spreadsheet-formula", value: "=HYPERLINK(\"https://example.invalid\",\"qa\")" },
  { name: "sql-like", value: "'; DROP TABLE project_documents; --" },
  { name: "oversized-string", value: "x".repeat(20_001) },
  { name: "null", value: null },
  { name: "array", value: ["qa", { nested: true }] },
  { name: "number", value: 42 },
  { name: "boolean", value: true },
  {
    name: "unknown-object-key",
    value: { unexpected_key: "unexpected-value" },
  },
]);
