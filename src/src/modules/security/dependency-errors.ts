const DOMAIN_STATUSES = new Set([400, 401, 403, 404, 409, 410]);
const TRANSPORT_CODES = new Set([
  "57014", "08000", "08001", "08003", "08004", "08006", "08007", "08P01",
  "PGRST000", "PGRST001", "PGRST002", "PGRST003",
  "ETIMEDOUT", "ESOCKETTIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EPIPE", "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_SOCKET",
]);

function isTransient(error: unknown, seen = new Set<object>()): boolean {
  if (typeof error !== "object" || error === null || seen.has(error)) return false;
  seen.add(error);
  const candidate = error as { status?: unknown; code?: unknown; message?: unknown; cause?: unknown };

  // Application denials/conflicts always win over transport-looking text or causes.
  if (typeof candidate.status === "number" && DOMAIN_STATUSES.has(candidate.status)) return false;
  // Keep SQLSTATE/PostgREST domain errors available to existing specific mappings.
  if (typeof candidate.code === "string" &&
      (/^[0-9A-Z]{5}$/.test(candidate.code) || /^PGRST\d{3}$/.test(candidate.code)) &&
      !TRANSPORT_CODES.has(candidate.code)) return false;
  if (typeof candidate.status === "number" && Number.isInteger(candidate.status) &&
      (candidate.status === 429 || (candidate.status >= 500 && candidate.status <= 599))) return true;
  if (typeof candidate.code === "string" && TRANSPORT_CODES.has(candidate.code)) return true;
  if (typeof candidate.message === "string" && /^(?:TypeError:\s*)?(?:fetch failed|failed to fetch|network request failed|connection terminated due to connection timeout|canceling statement due to statement timeout)$/i.test(candidate.message.trim())) return true;
  return isTransient(candidate.cause, seen);
}

/** Redact recognized dependency failures only; leave domain/database mappings intact. */
export function normalizeDependencyError(error: unknown): unknown {
  if (!isTransient(error)) return error;
  // Never attach the original error/cause, provider fields, or provider stack.
  return Object.assign(new Error("DEPENDENCY_UNAVAILABLE"), { status: 503 });
}

/** One awaited dependency operation, with no retries (especially for writes). */
export async function withDependencyErrors<T>(operation: () => PromiseLike<T>): Promise<T> {
  try {
    return await operation();
  } catch (error: unknown) {
    throw normalizeDependencyError(error);
  }
}

/** Inspect the SDK response before a repository discards its separate HTTP status. */
export async function withDependencyResult<T extends { error: unknown; status?: number }>(
  operation: () => PromiseLike<T>
): Promise<T> {
  const result = await withDependencyErrors(operation);
  if (!result.error) return result;

  const original = result.error;
  let error = original;
  if (typeof result.status === "number" && Number.isInteger(result.status) &&
      (result.status === 0 || (result.status >= 400 && result.status <= 599))) {
    const candidate = typeof original === "object" && original !== null
      ? original as { status?: unknown; message?: unknown }
      : { message: String(original) };
    error = {
      ...candidate,
      message: candidate.message,
      // The HTTP result is authoritative, not a status field in a provider body.
      // Installed PostgREST status0 is its caught client-side transport failure.
      status: result.status === 0 ? 503 : result.status,
    };
  }

  const normalized = normalizeDependencyError(error);
  if (normalized !== error) throw normalized;
  // Keep domain codes/messages and HTTP denials available to existing mappings.
  return error === original ? result : { ...result, error } as T;
}
