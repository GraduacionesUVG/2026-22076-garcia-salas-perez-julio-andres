import {
  normalizeSemanticWhitespace,
  readTask8JsonBody,
} from "@/__tests__/backend/task8-test-helpers";

function response(options: {
  contentType?: string;
  json?: () => Promise<unknown>;
}) {
  return {
    headers: () => ({
      "content-type": options.contentType ?? "application/json; charset=utf-8",
    }),
    json: options.json ?? (async () => ({ ok: true, participants: [] })),
  };
}

describe("Task 8 runtime response guards", () => {
  it("returns a JSON object with validated known envelope fields", async () => {
    await expect(
      readTask8JsonBody(
        response({
          json: async () => ({
            ok: true,
            participants: [{ id: "participant-1" }],
          }),
        }),
        "participant list"
      )
    ).resolves.toEqual({
      ok: true,
      participants: [{ id: "participant-1" }],
    });
  });

  it("fails clearly for a non-JSON content type", async () => {
    await expect(
      readTask8JsonBody(
        response({ contentType: "text/html; charset=utf-8" }),
        "participant list"
      )
    ).rejects.toThrow(
      "participant list: expected application/json content-type, received text/html; charset=utf-8"
    );
  });

  it("fails clearly when JSON parsing rejects", async () => {
    await expect(
      readTask8JsonBody(
        response({ json: async () => Promise.reject(new SyntaxError("bad JSON")) }),
        "source create"
      )
    ).rejects.toThrow("source create: response body is not valid JSON: bad JSON");
  });

  it.each([null, [], "text", 42])(
    "rejects a non-object JSON body: %#",
    async (value) => {
      await expect(
        readTask8JsonBody(response({ json: async () => value }), "Task 8 response")
      ).rejects.toThrow("Task 8 response: expected a JSON object");
    }
  );

  it.each([
    { ok: "yes" },
    { error: { message: "no" } },
    { participant: null },
    { participants: [null] },
    { source: [] },
    { sources: ["bad"] },
    { document: "bad" },
  ])("rejects malformed known response fields: %#", async (value) => {
    await expect(
      readTask8JsonBody(response({ json: async () => value }), "Task 8 response")
    ).rejects.toThrow("Task 8 response: invalid JSON response contract");
  });
});

describe("Task 8 semantic text normalization", () => {
  it("preserves the complete value while making extractor whitespace comparable", () => {
    const expected = "Proyecto de investigación 2026";
    const extracted = "  Proyecto\nde\t investigación\u00a02026  ";

    expect(normalizeSemanticWhitespace(extracted)).toContain(
      normalizeSemanticWhitespace(expected)
    );
    expect(normalizeSemanticWhitespace(extracted)).toBe(expected);
  });
});
