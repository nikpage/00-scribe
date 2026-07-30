import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureTrustedDevice } from "@/lib/device-trust";

// POST — called once from /setup right after the anonymous account + profile
// are created. Anonymous Supabase users have no email, but desktop phone
// login mints a session via generateLink(magiclink), which requires one.
// This gives the auth user a synthetic, never-emailed, pre-confirmed address
// so that path works later without ever sending mail or exposing the address
// to the worker.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!user.email) {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      email: `${user.id}@phone.internal.scribe`,
      email_confirm: true,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true });

  // A new number never sends an OTP — this device just created the account,
  // so it's the one moment we have to anchor trust to it.
  const deviceCookie = await ensureTrustedDevice(request, user.id);
  if (deviceCookie) {
    response.cookies.set(deviceCookie.name, deviceCookie.value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/auth",
      maxAge: deviceCookie.maxAge,
    });
  }

  return response;
}
