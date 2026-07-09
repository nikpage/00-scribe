import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the Supabase auth cookie for whoever is here, but do NOT gate
  // access. Auth gating is the (authed)/layout.tsx server check. Redirecting
  // unauthenticated users to /auth/login here loops forever: login was removed
  // (2cdd04d), so /auth/login now just redirects to /setup, and /setup is not
  // whitelisted — middleware would bounce it straight back to /auth/login.
  // Sessions are created client-side on /setup, so logged-out visitors must be
  // allowed to reach it.
  await supabase.auth.getUser();

  return supabaseResponse;
}
