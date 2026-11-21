import { NextResponse } from "next/server";
import { requireSession } from "@/src/modules/auth/auth.guard";

type ProfileRow = {
  id: string;
  full_name: string | null;
  role: "user" | "admin";
  created_at: string;
};

function forbiddenError() {
  const error: any = new Error("FORBIDDEN");
  error.status = 403;
  return error;
}

async function requireAdmin() {
  const { supabase, user } = await requireSession();

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile) {
    const unauthorized: any = new Error("UNAUTHORIZED");
    unauthorized.status = 401;
    throw unauthorized;
  }

  if (profile.role !== "admin") {
    throw forbiddenError();
  }

  return supabase;
}

export async function GET() {
  try {
    const supabase = await requireAdmin();

    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, role, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, users: (data ?? []) as ProfileRow[] });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: e?.status ?? 500 }
    );
  }
}