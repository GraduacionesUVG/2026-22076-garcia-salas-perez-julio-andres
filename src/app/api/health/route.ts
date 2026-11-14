import { NextResponse } from "next/server";
import { supabaseServer } from "@/src/lib/supabase/server";
import {
  canAccessInternalDiagnostics,
  internalDiagnosticsJson,
  internalDiagnosticsServerErrorResponse,
  INTERNAL_DIAGNOSTICS_NO_STORE_HEADERS,
} from "@/src/modules/security/internal-diagnostics";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!canAccessInternalDiagnostics(req)) {
    return NextResponse.json(
      { ok: true },
      {
        status: 200,
        headers: INTERNAL_DIAGNOSTICS_NO_STORE_HEADERS,
      }
    );
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
      checks: {
        app: "ok",
        database: "ok",
      },
    });
  } catch {
    return internalDiagnosticsServerErrorResponse();
  }
}