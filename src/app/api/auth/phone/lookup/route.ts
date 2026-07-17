import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhoneE164 } from "@/lib/phone";

// POST /api/auth/phone/lookup — { phone } -> { exists }
// First step of the unified phone-first flow: tells the client whether this
// number already has an account, so it can branch to OTP sign-in (existing)
// or the name field (new) without a separate login screen.
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

  return NextResponse.json({ exists: !!profile });
}
