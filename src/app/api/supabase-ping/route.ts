import { supabaseServer } from "@/src/lib/supabase/server";
import {
  canAccessInternalDiagnostics,
  internalDiagnosticsJson,
  internalDiagnosticsNotFoundResponse,
  internalDiagnosticsServerErrorResponse,
} from "@/src/modules/security/internal-diagnostics";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!canAccessInternalDiagnostics(req)) {
    return internalDiagnosticsNotFoundResponse();
  }

  try {
    const supabase = await supabaseServer();

    const { error } = await supabase
      .from("profiles")
      .select("id", { head: true, count: "exact" })
      .limit(1);

    if (error) {
      return internalDiagnosticsServerErrorResponse();
    }

    return internalDiagnosticsJson({
      ok: true,
      database: "reachable",
    });
  } catch {
    return internalDiagnosticsServerErrorResponse();
  }
}