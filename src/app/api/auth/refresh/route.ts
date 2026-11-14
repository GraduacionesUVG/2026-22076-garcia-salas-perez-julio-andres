import { NextResponse } from "next/server";
import { supabaseServer } from "@/src/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await supabaseServer();

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    hasSession: !!data.session,
    userId: data.session?.user?.id ?? null,
  });
}
