type RateLimitCheckInput = {
  namespace: string;
  key: string;
  limit: number;
  windowMs: number;
};

type RateLimitCheckResult = {
  limited: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSec: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __delimitationRateLimitStore:
    | Map<string, { count: number; resetAt: number }>
    | undefined;
}

const store =
  globalThis.__delimitationRateLimitStore ??
  new Map<string, { count: number; resetAt: number }>();

if (!globalThis.__delimitationRateLimitStore) {
  globalThis.__delimitationRateLimitStore = store;
}

function nowMs() {
  return Date.now();
}

function pruneExpiredEntries(now: number) {
  if (store.size < 1000) return;

  for (const [key, value] of store.entries()) {
    if (value.resetAt <= now) {
      store.delete(key);
    }
  }
}

export function checkMemoryRateLimit({
  namespace,
  key,
  limit,
  windowMs,
}: RateLimitCheckInput): RateLimitCheckResult {
  const now = nowMs();
  pruneExpiredEntries(now);

  const bucketKey = `${namespace}:${key}`;
  const existing = store.get(bucketKey);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    store.set(bucketKey, { count: 1, resetAt });

    return {
      limited: false,
      limit,
      remaining: Math.max(limit - 1, 0),
      resetAt,
      retryAfterSec: Math.max(Math.ceil((resetAt - now) / 1000), 1),
    };
  }

  if (existing.count >= limit) {
    return {
      limited: true,
      limit,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfterSec: Math.max(Math.ceil((existing.resetAt - now) / 1000), 1),
    };
  }

  existing.count += 1;
  store.set(bucketKey, existing);

  return {
    limited: false,
    limit,
    remaining: Math.max(limit - existing.count, 0),
    resetAt: existing.resetAt,
    retryAfterSec: Math.max(Math.ceil((existing.resetAt - now) / 1000), 1),
  };
}

export function buildRateLimitHeaders(result: RateLimitCheckResult) {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(result.resetAt),
    "Retry-After": String(result.retryAfterSec),
  };
}