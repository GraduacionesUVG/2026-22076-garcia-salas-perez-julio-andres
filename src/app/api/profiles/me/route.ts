import { normalizeDependencyError } from "@/src/modules/security/dependency-errors";
import { NextResponse } from "next/server";
import { requireSession } from "@/src/modules/auth/auth.guard";
import { getMyProfile, updateMyProfile } from "@/src/modules/users/users.service";
import { UpdateMeSchema } from "@/src/modules/users/users.schema";

export const dynamic = "force-dynamic";

/**
 * Ruta de compatibilidad.
 * La ruta canónica del usuario autenticado es:
 * /api/users/me
 *
 * Esta se mantiene para no romper clientes o tests existentes.
 */

export async function GET() {
  try {
    const { supabase, user } = await requireSession();

    const profile = await getMyProfile({
      supabase,
      user,
    });

    return NextResponse.json({ ok: true, profile });
  } catch (e: any) {
    e = normalizeDependencyError(e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: e?.status ?? 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const { supabase, user } = await requireSession();

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const parsed = UpdateMeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Validation error",
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const profile = await updateMyProfile({
      supabase,
      user,
      input: parsed.data,
    });

    return NextResponse.json({ ok: true, profile });
  } catch (e: any) {
    e = normalizeDependencyError(e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: e?.status ?? 500 }
    );
  }
}
