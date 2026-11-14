export const SUPABASE_FAILURE_CASES = [
  {
    name: "statement timeout",
    error: {
      code: "57014",
      message: "canceling statement due to statement timeout",
    },
    expectedStatus: 503,
  },
  {
    name: "connection timeout",
    error: new Error("Connection terminated due to connection timeout"),
    expectedStatus: 503,
  },
  {
    name: "rate limited",
    error: { status: 429, message: "Too Many Requests" },
    expectedStatus: 503,
  },
  {
    name: "bad gateway",
    error: { status: 502, message: "Bad Gateway" },
    expectedStatus: 503,
  },
  {
    name: "service unavailable",
    error: { status: 503, message: "Service Unavailable" },
    expectedStatus: 503,
  },
  { name: "provider internal failure", error: { status: 500, message: "Provider internal failure" }, expectedStatus: 503 },
  { name: "provider not implemented", error: { status: 501, message: "Provider not implemented" }, expectedStatus: 503 },
  { name: "provider gateway timeout", error: { status: 504, message: "Gateway Timeout" }, expectedStatus: 503 },
  { name: "provider protocol failure", error: { status: 505, message: "Provider protocol failure" }, expectedStatus: 503 },
] as const;

type ProviderFailureCase = (typeof SUPABASE_FAILURE_CASES)[number];

export function freshProviderFailure(failureCase: ProviderFailureCase): unknown {
  const source = failureCase.error;

  if (source instanceof Error) {
    return Object.assign(new Error(source.message), {
      details: "select secret_value from private_table",
      hint: "https://private.supabase.co?token=provider-secret",
    });
  }

  return {
    ...source,
    details: "select secret_value from private_table",
    hint: "https://private.supabase.co?token=provider-secret",
  };
}

export async function captureRejection(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation;
  } catch (error) {
    return error;
  }

  throw new Error("Expected the operation to reject");
}

export function expectSafeDependencyFailure(
  observed: unknown,
  failureCase: ProviderFailureCase
): void {
  const candidate = observed as {
    status?: unknown;
    message?: unknown;
  };
  const upstreamMessage = failureCase.error.message;
  const publicPayload = JSON.stringify({
    status: candidate?.status,
    error: candidate?.message,
  });

  expect(candidate?.status).toBe(failureCase.expectedStatus);
  expect(typeof candidate?.message).toBe("string");
  expect(String(candidate?.message ?? "").trim()).not.toBe("");
  expect(publicPayload.toLowerCase()).not.toContain(upstreamMessage.toLowerCase());
  expect(publicPayload).not.toMatch(/select\s+secret_value/i);
  expect(publicPayload).not.toMatch(/https?:\/\//i);
  expect(publicPayload).not.toMatch(/provider-secret/i);
  expect(publicPayload).not.toMatch(/\bstack\b/i);
}
