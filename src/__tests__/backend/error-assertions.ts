const SENSITIVE_FIELD = /^(?:stack(?:trace)?|sql[_-]?(?:state|code|query)|service[_-]?role|supabase.*(?:key|secret)|access[_-]?token|refresh[_-]?token|internal[_-]?url|provider[_-]?(?:payload|response|error|body)|raw[_-]?(?:provider|upstream)[_-]?(?:payload|response|error|body)?|upstream[_-]?(?:payload|response|error|body))$/iu;
const CONTEXTUAL_DIAGNOSTIC_FIELD = /^(?:constraint|table|schema|authorization)$/iu;

const SENSITIVE_VALUE_PATTERNS: ReadonlyArray<{
  label: string;
  pattern: RegExp;
}> = [
  {
    label: "stack trace",
    pattern: /(?:^|\n)\s*at\s+(?:async\s+)?(?:\S+\s+)?\(?[^:\n]+:\d+:\d+\)?/iu,
  },
  {
    label: "SQLSTATE",
    pattern: /\b(?:SQLSTATE[\s:=_-]*[0-9A-Z]{5}|(?:22|23|28|40|42|53|54|55|57|58|P0|XX)[0-9A-Z]{3})\b/iu,
  },
  {
    label: "database constraint",
    pattern: /\b(?:duplicate key(?: value)? violates unique constraint|violates (?:foreign key|check|not-null|unique)?\s*constraint|unique constraint)\b/iu,
  },
  {
    label: "database relation",
    pattern: /\b(?:permission denied for (?:table|relation|schema|sequence|function)|(?:relation|column)\s+["'`]?[-\w.]+["'`]?\s+does not exist|syntax error at or near|invalid input syntax for type\s+[-\w.]+)\b/iu,
  },
  {
    label: "SQL statement",
    pattern: /\bSELECT\s+(?:\*|["'`\w.,\s]+)\s+FROM\s+["'`]?[-\w.]+/iu,
  },
  {
    label: "Supabase secret",
    pattern: /\b(?:SUPABASE_[A-Z0-9_]*(?:KEY|SECRET)|service[_-]?role|sb_secret_[A-Za-z0-9_-]{12,})\b/iu,
  },
  {
    label: "token",
    pattern: /\b(?:Bearer\s+\S+|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,})\b/u,
  },
  {
    label: "internal URL",
    pattern: /\b(?:https?:\/\/(?:localhost|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})(?::\d+)?(?:\/\S*)?|https?:\/\/[a-z0-9-]+\.supabase\.co(?:\/\S*)?|postgres(?:ql)?:\/\/\S+)/iu,
  },
  {
    label: "provider payload",
    pattern: /\b(?:raw provider (?:payload|response|error)|raw upstream (?:payload|response|error))\b/iu,
  },
];

export interface ErrorResponseLike {
  status(): number;
  headers(): Record<string, string>;
  json(): Promise<unknown>;
}

export interface StreamingErrorResponseLike {
  headers(): Record<string, string>;
  text(): Promise<string>;
}

export interface SafeErrorPayloadOptions {
  readonly secrets?: readonly string[];
}

export interface DocumentedJsonErrorOptions extends SafeErrorPayloadOptions {
  readonly expectedStatus?: number;
  readonly expectedError?: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function leakReason(
  payload: unknown,
  secrets: readonly string[]
): string | null {
  const seen = new WeakSet<object>();

  const visit = (value: unknown, path: string): string | null => {
    if (typeof value === "string") {
      if (secrets.some((secret) => secret.length > 0 && value.includes(secret))) {
        return `${path} contains a supplied secret`;
      }

      const match = SENSITIVE_VALUE_PATTERNS.find(({ pattern }) =>
        pattern.test(value)
      );
      return match ? `${path} contains ${match.label}` : null;
    }

    if (typeof value !== "object" || value === null || seen.has(value)) {
      return null;
    }
    seen.add(value);

    if (Array.isArray(value)) {
      for (const [index, item] of value.entries()) {
        const reason = visit(item, `${path}[${index}]`);
        if (reason) return reason;
      }
      return null;
    }

    for (const [key, nested] of Object.entries(value)) {
      if (SENSITIVE_FIELD.test(key)) return `${path}.${key} is sensitive`;
      if (
        CONTEXTUAL_DIAGNOSTIC_FIELD.test(key) &&
        /(?:^|\.)diagnostic(?:\[\d+\])?$/iu.test(path)
      ) {
        return `${path}.${key} exposes backend diagnostics`;
      }
      if (
        /^(?:provider|upstream)$/iu.test(key) &&
        typeof nested === "object" &&
        nested !== null
      ) {
        return `${path}.${key} contains a raw provider payload`;
      }
      if (
        /^(?:details|detail)$/iu.test(key) &&
        record(nested) &&
        typeof nested.message === "string" &&
        typeof nested.status === "number" &&
        typeof nested.request_id === "string"
      ) {
        return `${path}.${key} contains a raw provider payload`;
      }
      const reason = visit(nested, `${path}.${key}`);
      if (reason) return reason;
    }
    return null;
  };

  return visit(payload, "$response");
}

export function assertSafeErrorPayload(
  payload: unknown,
  options: SafeErrorPayloadOptions = {}
): void {
  const reason = leakReason(payload, options.secrets ?? []);
  if (reason) throw new Error(`Error payload leak: ${reason}`);
}

export async function assertDocumentedJsonError(
  response: ErrorResponseLike,
  options: DocumentedJsonErrorOptions = {}
): Promise<Record<string, unknown>> {
  const status = response.status();
  if (!Number.isInteger(status) || status < 400 || status > 599) {
    throw new Error(`Expected an HTTP error status, received ${status}`);
  }
  if (options.expectedStatus !== undefined && status !== options.expectedStatus) {
    throw new Error(`Expected HTTP status ${options.expectedStatus}, received ${status}`);
  }

  const contentType = response.headers()["content-type"] ?? "";
  if (!/^application\/(?:[\w.+-]+\+)?json(?:\s*;|$)/iu.test(contentType)) {
    throw new Error(`Expected a JSON error response, received ${contentType || "no content type"}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error("Expected a parseable JSON error response", { cause: error });
  }

  if (
    !record(payload) ||
    payload.ok !== false ||
    typeof payload.error !== "string" ||
    payload.error.trim().length === 0
  ) {
    throw new Error("Expected documented error shape { ok: false, error: string }");
  }

  assertSafeErrorPayload(payload, options);
  if (options.expectedError !== undefined && payload.error !== options.expectedError) {
    // Do not echo a potentially sensitive unexpected upstream error.
    throw new Error(`Expected documented error ${options.expectedError}`);
  }
  return payload;
}

export async function assertDocumentedStreamingError(
  response: StreamingErrorResponseLike,
  options: SafeErrorPayloadOptions = {}
): Promise<{ type: "error"; errorText: string }> {
  const headers = response.headers();
  if (!/^text\/event-stream(?:\s*;|$)/iu.test(headers["content-type"] ?? "")) {
    throw new Error("Expected a text/event-stream error response");
  }
  if (headers["x-vercel-ai-ui-message-stream"] !== "v1") {
    throw new Error("Expected AI SDK UI message stream protocol v1");
  }

  const chunks: unknown[] = [];
  for (const line of (await response.text()).split(/\r?\n/u)) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice("data:".length).trim();
    if (!data || data === "[DONE]") continue;
    try {
      chunks.push(JSON.parse(data) as unknown);
    } catch (error) {
      throw new Error("Expected parseable JSON in streaming data frame", {
        cause: error,
      });
    }
  }

  const errorChunk = chunks.find(
    (chunk): chunk is { type: "error"; errorText: string } =>
      record(chunk) &&
      chunk.type === "error" &&
      typeof chunk.errorText === "string" &&
      chunk.errorText.trim().length > 0
  );
  if (!errorChunk) {
    throw new Error("Expected documented streaming error shape");
  }

  assertSafeErrorPayload({ error: errorChunk.errorText }, options);
  return errorChunk;
}
