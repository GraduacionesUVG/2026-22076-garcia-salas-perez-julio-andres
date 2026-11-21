import { NextResponse } from "next/server";
import {
  buildRateLimitHeaders,
  checkMemoryRateLimit,
} from "@/src/lib/ai-rate-limit";

type AuthRateLimitAction = "login" | "register" | "forgot-password";

type AuthRateLimitConfig = {
  windowMs: number;
  ipLimit: number;
  emailLimit: number;
  message: string;
};

const DEFAULT_WINDOW_15_MIN = 15 * 60 * 1000;
const DEFAULT_WINDOW_60_MIN = 60 * 60 * 1000;

function readPositiveIntEnv(name: string, fallback: number) {
  const raw = process.env[name];

  if (!raw) return fallback;

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function getAuthRateLimitConfig(action: AuthRateLimitAction): AuthRateLimitConfig {
  if (action === "login") {
    return {
      windowMs: readPositiveIntEnv(
        "AUTH_LOGIN_RATE_LIMIT_WINDOW_MS",
        DEFAULT_WINDOW_15_MIN
      ),
      ipLimit: readPositiveIntEnv("AUTH_LOGIN_IP_RATE_LIMIT", 30),
      emailLimit: readPositiveIntEnv("AUTH_LOGIN_EMAIL_RATE_LIMIT", 8),
      message:
        "Demasiados intentos de inicio de sesión. Intenta nuevamente más tarde.",
    };
  }

  if (action === "register") {
    return {
      windowMs: readPositiveIntEnv(
        "AUTH_REGISTER_RATE_LIMIT_WINDOW_MS",
        DEFAULT_WINDOW_60_MIN
      ),
      ipLimit: readPositiveIntEnv("AUTH_REGISTER_IP_RATE_LIMIT", 8),
      emailLimit: readPositiveIntEnv("AUTH_REGISTER_EMAIL_RATE_LIMIT", 3),
      message:
        "Demasiados intentos de registro. Intenta nuevamente más tarde.",
    };
  }

  return {
    windowMs: readPositiveIntEnv(
      "AUTH_FORGOT_PASSWORD_RATE_LIMIT_WINDOW_MS",
      DEFAULT_WINDOW_15_MIN
    ),
    ipLimit: readPositiveIntEnv("AUTH_FORGOT_PASSWORD_IP_RATE_LIMIT", 10),
    emailLimit: readPositiveIntEnv("AUTH_FORGOT_PASSWORD_EMAIL_RATE_LIMIT", 3),
    message:
      "Demasiadas solicitudes de recuperación. Intenta nuevamente más tarde.",
  };
}

function getClientIpForAuthRateLimit(request: Request) {
  const trustedHeaders = [
    "cf-connecting-ip",
    "true-client-ip",
    "x-real-ip",
    "x-vercel-forwarded-for",
  ];

  for (const headerName of trustedHeaders) {
    const value = request.headers.get(headerName)?.trim();

    if (value) {
      return value;
    }
  }

  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();

    if (firstIp) {
      return firstIp;
    }
  }

  return "unknown";
}

function normalizeEmailForRateLimit(email: string | null | undefined) {
  if (!email) return null;

  const normalized = email.trim().toLowerCase();

  if (!normalized) return null;

  return normalized
    .slice(0, 254)
    .replace(/[^a-z0-9@._+-]/gi, "_");
}

function getAuthRateLimitNamespace(action: AuthRateLimitAction, scope: "ip" | "email") {
  return `auth:${action}:${scope}`;
}

export function enforceAuthRateLimit(params: {
  request: Request;
  action: AuthRateLimitAction;
  email?: string | null;
}) {
  const { request, action, email } = params;

  const config = getAuthRateLimitConfig(action);

  const ipKey = getClientIpForAuthRateLimit(request);

  const ipResult = checkMemoryRateLimit({
    namespace: getAuthRateLimitNamespace(action, "ip"),
    key: ipKey,
    limit: config.ipLimit,
    windowMs: config.windowMs,
  });

  if (ipResult.limited) {
    return NextResponse.json(
      {
        ok: false,
        error: config.message,
      },
      {
        status: 429,
        headers: buildRateLimitHeaders(ipResult),
      }
    );
  }

  const emailKey = normalizeEmailForRateLimit(email);

  if (!emailKey) {
    return null;
  }

  const emailResult = checkMemoryRateLimit({
    namespace: getAuthRateLimitNamespace(action, "email"),
    key: emailKey,
    limit: config.emailLimit,
    windowMs: config.windowMs,
  });

  if (emailResult.limited) {
    return NextResponse.json(
      {
        ok: false,
        error: config.message,
      },
      {
        status: 429,
        headers: buildRateLimitHeaders(emailResult),
      }
    );
  }

  return null;
}