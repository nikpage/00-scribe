import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhoneE164 } from "@/lib/phone";
import { isDeviceTrusted } from "@/lib/device-trust";

// POST /api/auth/phone/device-login — { phone }
// If this device already proved itself once (OTP verify or account
// creation), mint a session for the phone's existing account with no OTP
// and no Vonage call. 401 if the device isn't trusted yet, so the client
// falls back to the normal OTP flow.
export async function POST(request: Request) {
  const { phone } = await request.json().catch(() => ({ phone: null }));
  if (typeof phone !== "string" || !phone.trim()) {
    return NextResponse.json({ error: "Missing phone" }, { status: 400 });
  }
  const normalized = normalizePhoneE164(phone);

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("phone", normalized)
    .maybeSingle();
  if (!profile) {
    return NextResponse.json({ error: "No account found for this number" }, { status: 404 });
  }

  if (!(await isDeviceTrusted(request, profile.id))) {
    return NextResponse.json({ error: "Device not trusted" }, { status: 401 });
  }

  const { data: authUser, error: userErr } = await admin.auth.admin.getUserById(profile.id);
  if (userErr || !authUser?.user?.email) {
    return NextResponse.json(
      { error: "Account is missing a login identity — reconnect on the phone that created it first." },
      { status: 500 }
    );
  }

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: authUser.user.email,
  });
  if (linkErr || !link) {
    return NextResponse.json({ error: linkErr?.message || "Could not create session" }, { status: 500 });
  }

  return NextResponse.json({ tokenHash: link.properties.hashed_token });
}
