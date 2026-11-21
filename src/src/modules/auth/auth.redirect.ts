export const DEFAULT_AUTH_REDIRECT_PATH = "/auth/reset";

export const PASSWORD_RECOVERY_COOKIE_NAME = "password-recovery-verified";

const SAME_ORIGIN_TEST_BASE = "https://safe.local";

const MAX_AUTH_REDIRECT_LENGTH = 512;

const ALLOWED_AUTH_REDIRECT_EXACT_PATHS = new Set([
  "/",
  "/auth/reset",
  "/dashboard",
  "/profile",
  "/login",
  "/register",
  "/forgot-password",
]);

const ALLOWED_AUTH_REDIRECT_PREFIXES = [
  "/projects/",
];

function hasUnsafeRedirectCharacters(value: string) {
  return /[\u0000-\u001F\u007F]/.test(value) || value.includes("\\");
}

function isSafeRelativePath(value: string) {
  if (!value) return false;

  if (value.length > MAX_AUTH_REDIRECT_LENGTH) {
    return false;
  }

  if (hasUnsafeRedirectCharacters(value)) {
    return false;
  }

  if (!value.startsWith("/")) {
    return false;
  }

  if (value.startsWith("//")) {
    return false;
  }

  return true;
}

function isAllowedAuthRedirectPath(pathname: string) {
  if (ALLOWED_AUTH_REDIRECT_EXACT_PATHS.has(pathname)) {
    return true;
  }

  return ALLOWED_AUTH_REDIRECT_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );
}

function normalizeFallbackPath(fallbackPath: string) {
  if (!isSafeRelativePath(fallbackPath)) {
    return DEFAULT_AUTH_REDIRECT_PATH;
  }

  try {
    const parsedFallback = new URL(fallbackPath, SAME_ORIGIN_TEST_BASE);

    if (parsedFallback.origin !== SAME_ORIGIN_TEST_BASE) {
      return DEFAULT_AUTH_REDIRECT_PATH;
    }

    if (!isAllowedAuthRedirectPath(parsedFallback.pathname)) {
      return DEFAULT_AUTH_REDIRECT_PATH;
    }

    return `${parsedFallback.pathname}${parsedFallback.search}${parsedFallback.hash}`;
  } catch {
    return DEFAULT_AUTH_REDIRECT_PATH;
  }
}

export function getSafeAuthRedirectPath(
  rawNext: string | null | undefined,
  fallbackPath = DEFAULT_AUTH_REDIRECT_PATH
) {
  const safeFallback = normalizeFallbackPath(fallbackPath);
  const value = typeof rawNext === "string" ? rawNext.trim() : "";

  if (!isSafeRelativePath(value)) {
    return safeFallback;
  }

  try {
    const parsed = new URL(value, SAME_ORIGIN_TEST_BASE);

    if (parsed.origin !== SAME_ORIGIN_TEST_BASE) {
      return safeFallback;
    }

    if (!isAllowedAuthRedirectPath(parsed.pathname)) {
      return safeFallback;
    }

    const safePath = `${parsed.pathname}${parsed.search}${parsed.hash}`;

    if (!isSafeRelativePath(safePath)) {
      return safeFallback;
    }

    return safePath;
  } catch {
    return safeFallback;
  }
}

export function buildSafeAuthRedirectUrl(
  requestUrl: string,
  rawNext: string | null | undefined,
  fallbackPath = DEFAULT_AUTH_REDIRECT_PATH
) {
  const requestOrigin = new URL(requestUrl).origin;
  const safePath = getSafeAuthRedirectPath(rawNext, fallbackPath);

  return new URL(safePath, requestOrigin);
}

export function isPasswordRecoveryRedirect(path: string) {
  try {
    const parsed = new URL(path, SAME_ORIGIN_TEST_BASE);
    return parsed.pathname === DEFAULT_AUTH_REDIRECT_PATH;
  } catch {
    return false;
  }
}