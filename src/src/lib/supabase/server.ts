import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import {
  logSecurityEvent,
  serializeSafeError,
} from "@/src/lib/secure-logger";

function getSupabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
}

function getSupabaseAnonKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY
  );
}

function getSecureCookieOptions(options: Record<string, any> = {}) {
  return {
    ...options,
    httpOnly: true,
    sameSite: options.sameSite ?? "lax",
    secure: process.env.NODE_ENV === "production" ? true : options.secure,
    path: options.path ?? "/",
  };
}

export async function supabaseServer() {
  const cookieStore = await cookies();

  const supabaseUrl = getSupabaseUrl();
  const supabaseAnonKey = getSupabaseAnonKey();

  if (!supabaseUrl) {
    throw new Error("Missing SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!supabaseAnonKey) {
    throw new Error("Missing SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },

      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, getSecureCookieOptions(options));
          });
        } catch (error) {
          logSecurityEvent("warn", "supabase.cookie_set_blocked", {
            error: serializeSafeError(error),
          });
        }
      },
    },
  });
}

export default supabaseServer;