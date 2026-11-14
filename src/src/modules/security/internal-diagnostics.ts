import { NextResponse } from "next/server";

export const INTERNAL_DIAGNOSTICS_HEADER = "x-internal-diagnostics-token";

export const INTERNAL_DIAGNOSTICS_NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function getConfiguredDiagnosticsToken() {
  return process.env.INTERNAL_DIAGNOSTICS_TOKEN?.trim() ?? "";
}

function isLocalDiagnosticsEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.ENABLE_LOCAL_DIAGNOSTICS === "true"
  );
}

function safeEqual(a: string, b: string) {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;

  let diff = 0;

  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return diff === 0;
}

export function canAccessInternalDiagnostics(req: Request) {
  if (isLocalDiagnosticsEnabled()) {
    return true;
  }

  const configuredToken = getConfiguredDiagnosticsToken();

  if (!configuredToken) {
    return false;
  }

  const requestToken = req.headers.get(INTERNAL_DIAGNOSTICS_HEADER)?.trim() ?? "";

  return safeEqual(requestToken, configuredToken);
}

export function internalDiagnosticsNotFoundResponse() {
  return NextResponse.json(
    {
      ok: false,
      error: "Not found",
    },
    {
      status: 404,
      headers: INTERNAL_DIAGNOSTICS_NO_STORE_HEADERS,
    }
  );
}

export function internalDiagnosticsServerErrorResponse() {
  return NextResponse.json(
    {
      ok: false,
      error: "Internal diagnostics check failed",
    },
    {
      status: 503,
      headers: INTERNAL_DIAGNOSTICS_NO_STORE_HEADERS,
    }
  );
}

export function internalDiagnosticsJson(
  body: Record<string, unknown>,
  status = 200
) {
  return NextResponse.json(body, {
    status,
    headers: INTERNAL_DIAGNOSTICS_NO_STORE_HEADERS,
  });
}