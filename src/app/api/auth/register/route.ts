import { NextResponse } from "next/server";
import { RegisterSchema } from "@/src/modules/auth/auth.schema";
import { registerWithEmailPassword } from "@/src/modules/auth/auth.service";
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

  const parsed = RegisterSchema.safeParse(body);

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
    action: "register",
    email: parsed.data.email,
  });

  if (rateLimitedResponse) {
    return rateLimitedResponse;
  }

  try {
    const result = await registerWithEmailPassword(parsed.data);

    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (e: any) {
    const status = e?.status ?? 500;

    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status }
    );
  }
}