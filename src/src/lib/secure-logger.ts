type LogLevel = "info" | "warn" | "error";

type LogPayload = Record<string, unknown>;

const REDACTED = "[REDACTED]";

const MAX_STRING_LENGTH = 800;
const MAX_ARRAY_ITEMS = 20;
const MAX_OBJECT_DEPTH = 5;

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /passcode/i,
  /token/i,
  /secret/i,
  /authorization/i,
  /cookie/i,
  /session/i,
  /jwt/i,
  /api[-_]?key/i,
  /access[-_]?token/i,
  /refresh[-_]?token/i,
  /anon[-_]?key/i,
  /service[-_]?role/i,
  /supabase[-_]?anon/i,
];

function isSensitiveKey(key: string) {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function truncateString(value: string) {
  if (value.length <= MAX_STRING_LENGTH) return value;

  return `${value.slice(0, MAX_STRING_LENGTH)}...[truncated]`;
}

export function redactForLog(value: unknown, depth = 0): unknown {
  if (depth > MAX_OBJECT_DEPTH) {
    return "[MAX_DEPTH]";
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return truncateString(value);
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return value;
  }

  if (value instanceof Error) {
    return serializeSafeError(value);
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => redactForLog(item, depth + 1));
  }

  if (typeof value === "object") {
    const result: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(key)) {
        result[key] = REDACTED;
        continue;
      }

      result[key] = redactForLog(item, depth + 1);
    }

    return result;
  }

  return String(value);
}

export function serializeSafeError(error: unknown) {
  if (!error) {
    return {
      message: "Unknown error",
    };
  }

  if (error instanceof Error) {
    const safeError: Record<string, unknown> = {
      name: error.name,
      message: error.message,
    };

    if (
      process.env.NODE_ENV !== "production" &&
      process.env.LOG_ERROR_STACKS === "true"
    ) {
      safeError.stack = error.stack;
    }

    return safeError;
  }

  if (typeof error === "object") {
    return redactForLog(error);
  }

  return {
    message: String(error),
  };
}

function shouldLog(level: LogLevel) {
  if (process.env.SECURITY_LOG_VERBOSE === "0") {
    return false;
  }

  if (level === "error" || level === "warn") {
    return true;
  }

  return process.env.NODE_ENV !== "production";
}

function safeStringify(payload: unknown) {
  try {
    return JSON.stringify(redactForLog(payload));
  } catch {
    return JSON.stringify({
      fallback: "serialization_failed",
    });
  }
}

export function logSecurityEvent(
  level: LogLevel,
  event: string,
  payload: LogPayload = {}
) {
  if (!shouldLog(level)) return;

  const line = safeStringify({
    ts: new Date().toISOString(),
    scope: "security",
    level,
    event,
    ...payload,
  });

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.info(line);
}