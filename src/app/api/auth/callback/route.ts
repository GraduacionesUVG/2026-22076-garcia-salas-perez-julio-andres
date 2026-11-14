import { NextResponse } from "next/server";
import { supabaseServer } from "@/src/lib/supabase/server";
import {
  buildSafeAuthRedirectUrl,
  DEFAULT_AUTH_REDIRECT_PATH,
  getSafeAuthRedirectPath,
  isPasswordRecoveryRedirect,
  PASSWORD_RECOVERY_COOKIE_NAME,
} from "@/src/modules/auth/auth.redirect";

export const dynamic = "force-dynamic";

function setPasswordRecoveryCookieIfNeeded(
  response: NextResponse,
  safeNextPath: string
) {
  if (!isPasswordRecoveryRedirect(safeNextPath)) {
    return response;
  }

  response.cookies.set(PASSWORD_RECOVERY_COOKIE_NAME, "true", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });

  return response;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const rawNext = url.searchParams.get("next");

  if (!code) {
    return NextResponse.redirect(new URL("/login?e=missing_code", url.origin));
  }

  const safeNextPath = getSafeAuthRedirectPath(
    rawNext,
    DEFAULT_AUTH_REDIRECT_PATH
  );

  const redirectUrl = buildSafeAuthRedirectUrl(
    req.url,
    safeNextPath,
    DEFAULT_AUTH_REDIRECT_PATH
  );

  const supabase = await supabaseServer();

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(`/login?e=${encodeURIComponent(error.message)}`, url.origin)
    );
  }

  const response = NextResponse.redirect(redirectUrl);

  return setPasswordRecoveryCookieIfNeeded(response, safeNextPath);
}