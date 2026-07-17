import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhoneE164 } from "@/lib/phone";
import { startPhoneVerification } from "@/lib/vonage";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_IN_WINDOW = 3;

// POST /api/auth/phone/start — { phone }
// Sends an OTP via Vonage Verify v2 to a phone that already has an account
// (created on mobile at /setup). Returns a requestId the client sends back
// to /verify. Rate-limited per phone: each send is a billed SMS.
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
    return NextResponse.json(
      { error: "No account found for this number. Register on your phone first." },
      { status: 404 }
    );
  }

  const now = Date.now();
  const { data: throttle } = await admin
    .from("phone_otp_throttle")
    .select("*")
    .eq("phone", normalized)
    .maybeSingle();

  if (throttle) {
    const windowStart = new Date(throttle.window_start).getTime();
    const inWindow = now - windowStart < WINDOW_MS;
    if (inWindow && throttle.count_in_window >= MAX_IN_WINDOW) {
      return NextResponse.json(
        { error: "Too many codes sent. Please wait a few minutes and try again." },
        { status: 429 }
      );
    }
    await admin
      .from("phone_otp_throttle")
      .update({
        last_sent_at: new Date(now).toISOString(),
        window_start: inWindow ? throttle.window_start : new Date(now).toISOString(),
        count_in_window: inWindow ? throttle.count_in_window + 1 : 1,
      })
      .eq("phone", normalized);
  } else {
    await admin.from("phone_otp_throttle").insert({
      phone: normalized,
      last_sent_at: new Date(now).toISOString(),
      window_start: new Date(now).toISOString(),
      count_in_window: 1,
    });
  }

  try {
    const requestId = await startPhoneVerification(normalized);
    return NextResponse.json({ requestId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not send code" },
      { status: 502 }
    );
  }
}
