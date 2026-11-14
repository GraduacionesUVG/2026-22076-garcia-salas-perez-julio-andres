import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/src/lib/supabase/server";
import { enforceAuthRateLimit } from "@/src/modules/auth/auth.rate-limit";
import { DEFAULT_AUTH_REDIRECT_PATH } from "@/src/modules/auth/auth.redirect";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  email: z.string().email(),
});

export async function POST(req: Request) {
  const supabase = await supabaseServer();

  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parsed = BodySchema.safeParse(body);

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

  const { email } = parsed.data;

  const rateLimitedResponse = enforceAuthRateLimit({
    request: req,
    action: "forgot-password",
    email,
  });

  if (rateLimitedResponse) {
    return rateLimitedResponse;
  }

  const origin = new URL(req.url).origin;

  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(
    DEFAULT_AUTH_REDIRECT_PATH
  )}`;

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (error) {
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}