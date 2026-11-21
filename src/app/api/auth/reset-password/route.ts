import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireSession } from "@/src/modules/auth/auth.guard";
import { ResetPasswordSchema } from "@/src/modules/auth/auth.schema";
import { resetPasswordWithRecoverySession } from "@/src/modules/auth/auth.service";

export const dynamic = "force-dynamic";

const PASSWORD_RECOVERY_COOKIE = "password-recovery-verified";

function clearRecoveryCookie(response: NextResponse) {
  response.cookies.set(PASSWORD_RECOVERY_COOKIE, "", {
    path: "/",
    maxAge: 0,
  });

  return response;
}

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const recoveryCookie = cookieStore.get(PASSWORD_RECOVERY_COOKIE);

    if (recoveryCookie?.value !== "true") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "El enlace de recuperación no es válido o ya expiró. Solicita uno nuevo.",
        },
        { status: 403 }
      );
    }

    const { supabase } = await requireSession();

    let body: unknown;

    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const parsed = ResetPasswordSchema.safeParse(body);

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

    await resetPasswordWithRecoverySession({
      supabase,
      input: parsed.data,
    });

    const response = NextResponse.json({ ok: true });
    return clearRecoveryCookie(response);
  } catch (e: any) {
    const response = NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: e?.status ?? 500 }
    );

    return clearRecoveryCookie(response);
  }
}