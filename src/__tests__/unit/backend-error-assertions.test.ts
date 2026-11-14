import {
  assertDocumentedJsonError,
  assertDocumentedStreamingError,
  assertSafeErrorPayload,
  type ErrorResponseLike,
} from "@/__tests__/backend/error-assertions";

function response(input: {
  contentType?: string;
  body?: unknown;
  status?: number;
  jsonError?: Error;
}): ErrorResponseLike {
  return {
    status: () => input.status ?? 400,
    headers: () => ({
      "content-type": input.contentType ?? "application/json; charset=utf-8",
    }),
    json: async () => {
      if (input.jsonError) throw input.jsonError;
      return input.body;
    },
  };
}

describe("assertDocumentedJsonError", () => {
  const validationContract = {
    secrets: [] as string[], expectedStatus: 400, expectedError: "VALIDATION_ERROR",
  };

  it.each([401, 403, 404, 409, 429, 500])(
    "does not mistake status %s for an expected validation failure",
    async (status) => {
      await expect(assertDocumentedJsonError(
        response({ status, body: { ok: false, error: "VALIDATION_ERROR" } }),
        validationContract
      )).rejects.toThrow("Expected HTTP status 400");
    }
  );

  it("rejects the wrong error contract even when the expected status matches", async () => {
    await expect(assertDocumentedJsonError(
      response({ body: { ok: false, error: "UNAUTHORIZED" } }), validationContract
    )).rejects.toThrow("Expected documented error VALIDATION_ERROR");
  });

  it("accepts the exact expected error without disabling leak checks", async () => {
    await expect(assertDocumentedJsonError(
      response({ body: { ok: false, error: "VALIDATION_ERROR" } }), validationContract
    )).resolves.toEqual({ ok: false, error: "VALIDATION_ERROR" });
    await expect(assertDocumentedJsonError(
      response({ body: { ok: false, error: "VALIDATION_ERROR", nested: { access_token: "private" } } }),
      validationContract
    )).rejects.toThrow("Error payload leak");
  });

  it("accepts a documented JSON error and benign nested metadata", async () => {
    await expect(
      assertDocumentedJsonError(
        response({
          body: {
            ok: false,
            error: "Invitation is no longer available",
            metadata: {
              field: "email",
              reason: "The supplied value is already in use",
            },
          },
        })
      )
    ).resolves.toEqual({
      ok: false,
      error: "Invitation is no longer available",
      metadata: {
        field: "email",
        reason: "The supplied value is already in use",
      },
    });
  });

  it.each([
    ["non-JSON content", response({ contentType: "text/plain", body: "no" })],
    ["invalid JSON", response({ jsonError: new Error("invalid JSON") })],
    ["an array", response({ body: [{ ok: false, error: "no" }] })],
    ["missing ok", response({ body: { error: "no" } })],
    ["truthy ok", response({ body: { ok: true, error: "no" } })],
    ["missing error", response({ body: { ok: false } })],
    ["empty error", response({ body: { ok: false, error: "   " } })],
    ["a successful status", response({ status: 200, body: { ok: false, error: "no" } })],
  ])("rejects %s", async (_label, candidate) => {
    await expect(assertDocumentedJsonError(candidate)).rejects.toThrow();
  });
});

describe("assertSafeErrorPayload", () => {
  it.each([
    { error: "failed", nested: { stack: "Error: failed" } },
    { error: "failed", nested: [{ code: "23505" }] },
    { error: "duplicate key value violates unique constraint users_email_key" },
    { error: "permission denied for table project_members" },
    { error: "failed", diagnostic: { constraint: "documents_project_id_fkey" } },
    { error: "failed", diagnostic: { table: "project_members" } },
    { error: "failed", key: "SUPABASE_SERVICE_ROLE_KEY=secret" },
    { error: "failed", token: "sb_secret_abcdefghijklmnopqrstuvwxyz" },
    { error: "failed", endpoint: "http://127.0.0.1:54321/rest/v1" },
    { error: "failed", endpoint: "http://10.0.0.7:8080/private" },
    { error: "failed", nested: { providerPayload: { message: "quota", status: 429 } } },
    { error: "failed", nested: { provider: { message: "quota", status: 429 } } },
    { error: "failed", nested: { raw_upstream_response: { id: "provider-1" } } },
    { error: "SELECT id, email FROM auth.users WHERE id = $1" },
    { error: 'column "project_id" does not exist' },
    { error: 'invalid input syntax for type uuid: "not-a-uuid"' },
    {
      error: "Request failed",
      details: { message: "quota exceeded", status: 429, request_id: "provider-1" },
    },
  ])("rejects recursive backend leakage %#", (payload) => {
    expect(() => assertSafeErrorPayload(payload)).toThrow("Error payload leak");
  });

  it("permits benign text that mentions user-facing resources", () => {
    expect(() =>
      assertSafeErrorPayload({
        ok: false,
        error: "The table view could not be updated because the invitation expired",
        details: {
          fields: ["title", "email"],
          help: "Open the project and try again",
          code: "INVITATION_EXPIRED",
        },
      })
    ).not.toThrow();
  });

  it("permits a benign provider name without a raw provider payload", () => {
    expect(() =>
      assertSafeErrorPayload({
        ok: false,
        error: "The requested integration is unavailable",
        metadata: { provider: "configured integration" },
      })
    ).not.toThrow();
  });

  it.each([
    { schema: "public form" },
    { table: "results view" },
    { constraint: "Select an option before continuing" },
    { authorization: "Contact a project owner for access" },
  ])("permits benign metadata keys when their values are not sensitive: %#", (details) => {
    expect(() =>
      assertSafeErrorPayload({
        ok: false,
        error: "Select an option before continuing",
        details,
      })
    ).not.toThrow();
  });

  it("rejects an explicitly supplied secret at any depth", () => {
    expect(() =>
      assertSafeErrorPayload(
        { ok: false, error: "Request failed", context: ["qa-safe", "known-secret"] },
        { secrets: ["known-secret"] }
      )
    ).toThrow("supplied secret");
  });
});

describe("assertDocumentedStreamingError", () => {
  function streamResponse(body: string, headers: Record<string, string> = {}) {
    return {
      headers: () => ({
        "content-type": "text/event-stream",
        "x-vercel-ai-ui-message-stream": "v1",
        ...headers,
      }),
      text: async () => body,
    };
  }

  it("accepts the documented AI SDK v1 error chunk", async () => {
    await expect(
      assertDocumentedStreamingError(
        streamResponse(
          'data: {"type":"error","errorText":"Unable to respond right now"}\n\n'
        )
      )
    ).resolves.toEqual({
      type: "error",
      errorText: "Unable to respond right now",
    });
  });

  it.each([
    ["wrong content type", streamResponse("data: {}\n\n", { "content-type": "application/json" })],
    ["wrong protocol", streamResponse("data: {}\n\n", { "x-vercel-ai-ui-message-stream": "v2" })],
    ["missing error chunk", streamResponse('data: {"type":"finish"}\n\n')],
    ["malformed data", streamResponse("data: not-json\n\n")],
  ])("rejects %s", async (_label, candidate) => {
    await expect(assertDocumentedStreamingError(candidate)).rejects.toThrow();
  });

  it("applies recursive leak detection to streaming error text", async () => {
    await expect(
      assertDocumentedStreamingError(
        streamResponse(
          'data: {"type":"error","errorText":"SELECT * FROM auth.users"}\n\n'
        )
      )
    ).rejects.toThrow("Error payload leak");
  });
});
