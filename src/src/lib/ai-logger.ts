import { redactForLog, serializeSafeError } from "@/src/lib/secure-logger";

type AiLogLevel = "info" | "warn" | "error";

type AiLogPayload = Record<string, unknown>;

function shouldLog(level: AiLogLevel) {
  if (process.env.AI_LOG_VERBOSE === "0") {
    return false;
  }

  if (level === "error" || level === "warn") {
    return true;
  }

  if (process.env.NODE_ENV === "production") {
    return process.env.AI_LOG_VERBOSE === "1";
  }

  return true;
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

export function logAiEvent(
  level: AiLogLevel,
  event: string,
  payload: AiLogPayload = {}
) {
  if (!shouldLog(level)) return;

  const line = safeStringify({
    ts: new Date().toISOString(),
    scope: "ai",
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

export function serializeError(error: unknown) {
  return serializeSafeError(error);
}