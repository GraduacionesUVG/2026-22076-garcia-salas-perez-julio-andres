import { NextResponse } from "next/server";
import { requireSession } from "@/src/modules/auth/auth.guard";
import { ChangePasswordSchema } from "@/src/modules/auth/auth.schema";
import { changePasswordWithCurrentPassword } from "@/src/modules/auth/auth.service";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
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

    const parsed = ChangePasswordSchema.safeParse(body);

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

    await changePasswordWithCurrentPassword({
      supabase,
      user,
      input: parsed.data,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: e?.status ?? 500 }
    );
  }
}