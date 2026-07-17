import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhoneE164 } from "@/lib/phone";
import { checkPhoneVerification } from "@/lib/vonage";

// POST /api/auth/phone/verify — { phone, requestId, code }
// Confirms the OTP with Vonage, then mints a magic-link token for the
// EXISTING auth user tied to that phone (created on mobile at /setup) and
// hands the client { email, tokenHash } so it can call
// supabase.auth.verifyOtp({ email, token_hash, type: "magiclink" }) and land
// on the same auth.uid the worker's phone already has — never a second,
// empty account.
export async function POST(request: Request) {
  const { phone, requestId, code } = await request.json().catch(() => ({}));
  if (
    typeof phone !== "string" ||
    typeof requestId !== "string" ||
    typeof code !== "string" ||
    !code.trim()
  ) {
    return NextResponse.json({ error: "Missing phone, requestId, or code" }, { status: 400 });
  }
  const normalized = normalizePhoneE164(phone);

  const ok = await checkPhoneVerification(requestId, code.trim());
  if (!ok) {
    return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("phone", normalized)
    .maybeSingle();
  if (!profile) {
    return NextResponse.json({ error: "No account found for this number" }, { status: 404 });
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

  return NextResponse.json({
    tokenHash: link.properties.hashed_token,
  });
}
