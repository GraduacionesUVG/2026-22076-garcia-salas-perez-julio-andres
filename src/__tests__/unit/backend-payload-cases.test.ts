import {
  HOSTILE_PAYLOAD_CASES,
  type HostilePayloadCase,
} from "@/__tests__/backend/payload-cases";

const REQUIRED_CASES = [
  "whitespace",
  "unicode",
  "html",
  "spreadsheet-formula",
  "sql-like",
  "oversized-string",
  "null",
  "array",
  "number",
  "boolean",
  "unknown-object-key",
] as const;

function expectDeeplyFrozen(value: unknown): void {
  if (typeof value !== "object" || value === null) return;

  expect(Object.isFrozen(value)).toBe(true);
  for (const nested of Object.values(value)) expectDeeplyFrozen(nested);
}

describe("HOSTILE_PAYLOAD_CASES", () => {
  test("exports every required hostile and boundary category exactly once", () => {
    expect(HOSTILE_PAYLOAD_CASES.map(({ name }) => name)).toEqual(REQUIRED_CASES);
    expect(new Set(HOSTILE_PAYLOAD_CASES.map(({ name }) => name)).size).toBe(
      HOSTILE_PAYLOAD_CASES.length
    );
  });

  test("provides JSON-serializable values with useful boundary shapes", () => {
    const byName = new Map<string, HostilePayloadCase>(
      HOSTILE_PAYLOAD_CASES.map((payloadCase) => [payloadCase.name, payloadCase])
    );

    expect(byName.get("whitespace")?.value).toMatch(/^\s+$/u);
    expect(byName.get("unicode")?.value).toEqual(expect.any(String));
    expect(byName.get("html")?.value).toContain("<script>");
    expect(byName.get("spreadsheet-formula")?.value).toMatch(/^[=+\-@]/u);
    expect(byName.get("sql-like")?.value).toContain("DROP TABLE");
    expect((byName.get("oversized-string")?.value as string).length).toBe(20_001);
    expect(byName.get("null")?.value).toBeNull();
    expect(Array.isArray(byName.get("array")?.value)).toBe(true);
    expect(typeof byName.get("number")?.value).toBe("number");
    expect(typeof byName.get("boolean")?.value).toBe("boolean");
    expect(byName.get("unknown-object-key")?.value).toEqual({
      unexpected_key: "unexpected-value",
    });

    for (const payloadCase of HOSTILE_PAYLOAD_CASES) {
      expect(() => JSON.stringify(payloadCase.value)).not.toThrow();
    }
  });

  test("deeply freezes the catalog, cases, and structured values", () => {
    expectDeeplyFrozen(HOSTILE_PAYLOAD_CASES);
  });
});
