import { getOptionalSession } from "@/src/modules/auth/auth.guard";
import {
  canAccessInternalDiagnostics,
  internalDiagnosticsJson,
  internalDiagnosticsNotFoundResponse,
} from "@/src/modules/security/internal-diagnostics";

export const dynamic = "force-dynamic";

function maskEmail(email: string | null) {
  if (!email) return null;

  const [localPart, domain] = email.split("@");

  if (!localPart || !domain) {
    return "***";
  }

  const visibleStart = localPart.slice(0, 2);
  return `${visibleStart}***@${domain}`;
}

export async function GET(req: Request) {
  if (!canAccessInternalDiagnostics(req)) {
    return internalDiagnosticsNotFoundResponse();
  }

  try {
    const { user } = await getOptionalSession();

    return internalDiagnosticsJson({
      ok: true,
      authenticated: Boolean(user),
      user: user
        ? {
            id: user.id,
            email: maskEmail(user.email),
          }
        : null,
    });
  } catch {
    return internalDiagnosticsJson(
      {
        ok: false,
        error: "Could not read auth diagnostics",
      },
      500
    );
  }
}