import { normalizeDependencyError } from "@/src/modules/security/dependency-errors";
import { NextResponse } from "next/server";
import { requireSession } from "@/src/modules/auth/auth.guard";
import { getMe, updateMe } from "@/src/modules/users/users.service";
import { UpdateMeSchema } from "@/src/modules/users/users.schema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { supabase, user } = await requireSession();

    const payload = await getMe({
      supabase,
      user,
    });

    return NextResponse.json({ ok: true, ...payload });
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

    const payload = await updateMe({
      supabase,
      user,
      input: parsed.data,
    });

    return NextResponse.json({ ok: true, ...payload });
  } catch (e: any) {
    e = normalizeDependencyError(e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: e?.status ?? 500 }
    );
  }
}
