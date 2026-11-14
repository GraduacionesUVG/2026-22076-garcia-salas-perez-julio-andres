import { NextRequest, NextResponse } from "next/server";
import {
  applySecurityHeaders,
  enforceCsrfProtection,
} from "@/src/modules/security/http-security";

export function proxy(request: NextRequest) {
  const csrfResponse = enforceCsrfProtection(request);

  if (csrfResponse) {
    return applySecurityHeaders(csrfResponse);
  }

  const response = NextResponse.next();

  return applySecurityHeaders(response);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|txt)$).*)",
  ],
};