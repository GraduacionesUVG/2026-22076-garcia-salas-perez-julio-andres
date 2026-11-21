import { loginQaSession } from "@/__tests__/backend/sessions";

const SENSITIVE_FIELD =
  /^(?:access[_-]?token|refresh[_-]?token|service[_-]?role|authorization|stack|sql(?:state|code|query)|supabase.*(?:key|secret))$/i;
const SENSITIVE_VALUE_PATTERNS = [
  /\b(?:access_token|refresh_token|service_role|SUPABASE_[A-Z0-9_]+)\b/i,
  /\bBearer\s+\S+/i,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
  /(?:^|\n)\s*at\s+(?:\S+\s+)?\(?[^:\n]+:\d+:\d+\)?/i,
  /duplicate key(?: value)? violates unique constraint/i,
  /\bunique constraint\b/i,
  /\bviolates (?:\w+\s+)?constraint\b/i,
  /permission denied for (?:table|relation|schema|sequence|function)/i,
  /\b(?:sqlstate|postgres(?:ql)?|relation\s+\S+\s+does not exist)\b/i,
  /syntax error at or near/i,
] as const;

function leakageReason(value: unknown, secrets: readonly string[]): string | null {
  const seen = new WeakSet<object>();

  function visit(current: unknown, path: string): string | null {
    if (typeof current === "string") {
      if (SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(current))) {
        return `${path} contains sensitive backend details`;
      }
      if (secrets.some((secret) => secret.length > 0 && current.includes(secret))) {
        return `${path} contains a supplied secret`;
      }
      return null;
    }

    if (typeof current !== "object" || current === null || seen.has(current)) {
      return null;
    }
    seen.add(current);

    if (Array.isArray(current)) {
      for (const [index, item] of current.entries()) {
        const reason = visit(item, `${path}[${index}]`);
        if (reason) return reason;
      }
      return null;
    }

    for (const [key, nested] of Object.entries(current)) {
      if (SENSITIVE_FIELD.test(key)) return `${path}.${key} is sensitive`;
      const reason = visit(nested, `${path}.${key}`);
      if (reason) return reason;
    }
    return null;
  }

  return visit(value, "$response");
}

export function assertNoBackendLeak(
  value: unknown,
  secrets: readonly string[] = []
): void {
  const reason = leakageReason(value, secrets);
  if (reason) throw new Error(`Backend leakage detected: ${reason}`);
}

function isApprovedTransientLoginFailure(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { status?: unknown; backendError?: unknown };
  return (
    candidate.status === 500 &&
    typeof candidate.backendError === "string" &&
    /(?:fetch failed|connect(?:ion)? timeout|ConnectTimeoutError|UND_ERR_CONNECT_TIMEOUT)/i.test(
      candidate.backendError
    )
  );
}

export async function loginQaSessionWithOneTransientRetry(
  params: Parameters<typeof loginQaSession>[0]
): Promise<Awaited<ReturnType<typeof loginQaSession>>> {
  try {
    return await loginQaSession(params);
  } catch (error) {
    if (!isApprovedTransientLoginFailure(error)) throw error;
    return loginQaSession(params);
  }
}

function appendFailure(failures: unknown[], error: unknown): void {
  if (error instanceof AggregateError) {
    error.errors.forEach((nested) => appendFailure(failures, nested));
    return;
  }
  failures.push(error);
}

export async function runWithCleanupAggregation<T>(
  operation: () => Promise<T>,
  cleanups: readonly (() => Promise<void>)[],
  message: string
): Promise<T> {
  const failures: unknown[] = [];
  let result: T | undefined;

  try {
    result = await operation();
  } catch (error) {
    appendFailure(failures, error);
  }

  for (const cleanup of cleanups) {
    try {
      await cleanup();
    } catch (error) {
      appendFailure(failures, error);
    }
  }

  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(failures, message);
  }
  return result as T;
}

export async function restoreValueAndVerify<T>(params: {
  read: () => Promise<T>;
  restore: (expected: T) => Promise<void>;
  expected: T;
  equals: (left: T, right: T) => boolean;
  message: string;
}): Promise<void> {
  const { read, restore, expected, equals, message } = params;

  await runWithCleanupAggregation(
    async () => {
      const current = await read();
      if (!equals(current, expected)) await restore(expected);
    },
    [
      async () => {
        const verified = await read();
        if (!equals(verified, expected)) {
          throw new Error("Restored value verification failed");
        }
      },
    ],
    message
  );
}
