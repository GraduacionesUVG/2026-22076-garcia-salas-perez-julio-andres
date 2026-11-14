import { NextResponse } from "next/server";
import { LoginSchema } from "@/src/modules/auth/auth.schema";
import { loginWithEmailPassword } from "@/src/modules/auth/auth.service";
import { enforceAuthRateLimit } from "@/src/modules/auth/auth.rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parsed = LoginSchema.safeParse(body);

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

  const rateLimitedResponse = enforceAuthRateLimit({
    request: req,
    action: "login",
    email: parsed.data.email,
  });

  if (rateLimitedResponse) {
    return rateLimitedResponse;
  }

  try {
    const result = await loginWithEmailPassword(parsed.data);

    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    const status =
      e?.status ?? (e?.message === "Invalid credentials" ? 401 : 500);

    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status }
    );
  }
}