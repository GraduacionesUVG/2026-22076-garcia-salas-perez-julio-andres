import { NextRequest, NextResponse } from "next/server";

const CSRF_BLOCK_STATUS = 403;

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const SECURITY_HEADER_NAMES = [
  "Content-Security-Policy",
  "Referrer-Policy",
  "X-Frame-Options",
  "X-Content-Type-Options",
  "Permissions-Policy",
  "Strict-Transport-Security",
  "Cross-Origin-Opener-Policy",
  "Cross-Origin-Resource-Policy",
  "X-DNS-Prefetch-Control",
];

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function buildContentSecurityPolicy() {
  const scriptSrc = isProduction()
    ? "'self' 'unsafe-inline'"
    : "'self' 'unsafe-inline' 'unsafe-eval'";

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https://lh3.googleusercontent.com",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export function getSecurityHeaders() {
  const headers: Record<string, string> = {
    "Content-Security-Policy": buildContentSecurityPolicy(),
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "X-DNS-Prefetch-Control": "off",
  };

  if (isProduction()) {
    headers["Strict-Transport-Security"] =
      "max-age=31536000; includeSubDomains; preload";
  }

  return headers;
}

export function applySecurityHeaders(response: NextResponse) {
  const headers = getSecurityHeaders();

  for (const [name, value] of Object.entries(headers)) {
    response.headers.set(name, value);
  }

  return response;
}

function getOriginFromReferer(referer: string | null) {
  if (!referer) return null;

  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

function hasSessionLikeCookies(request: NextRequest) {
  const cookies = request.cookies.getAll();

  if (cookies.length === 0) return false;

  return cookies.some((cookie) => {
    const name = cookie.name.toLowerCase();

    return (
      name.startsWith("sb-") ||
      name.includes("auth") ||
      name.includes("session") ||
      name.includes("token") ||
      name === "password-recovery-verified"
    );
  });
}

function isApiRequest(request: NextRequest) {
  return request.nextUrl.pathname.startsWith("/api/");
}

function isMutatingRequest(request: NextRequest) {
  return MUTATING_METHODS.has(request.method.toUpperCase());
}

function isSameOrigin(request: NextRequest) {
  const expectedOrigin = request.nextUrl.origin;
  const origin = request.headers.get("origin");

  if (origin) {
    return origin === expectedOrigin;
  }

  const refererOrigin = getOriginFromReferer(request.headers.get("referer"));

  if (refererOrigin) {
    return refererOrigin === expectedOrigin;
  }

  return false;
}

function shouldApplyCsrfProtection(request: NextRequest) {
  return (
    isApiRequest(request) &&
    isMutatingRequest(request) &&
    hasSessionLikeCookies(request)
  );
}

export function getCsrfViolationResponse() {
  return NextResponse.json(
    {
      ok: false,
      error: "CSRF validation failed",
    },
    {
      status: CSRF_BLOCK_STATUS,
      headers: {
        "Cache-Control": "no-store, max-age=0, must-revalidate",
      },
    }
  );
}

export function enforceCsrfProtection(request: NextRequest) {
  if (!shouldApplyCsrfProtection(request)) {
    return null;
  }

  if (isSameOrigin(request)) {
    return null;
  }

  return getCsrfViolationResponse();
}

export function removeDuplicateSecurityHeaders(response: NextResponse) {
  for (const headerName of SECURITY_HEADER_NAMES) {
    const value = response.headers.get(headerName);

    if (!value) continue;

    response.headers.set(headerName, value);
  }

  return response;
}