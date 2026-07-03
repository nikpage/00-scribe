import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { startPhoneVerification, toE164 } from "@/lib/vonage";

const MIN_INTERVAL_MS = 30 * 1000;
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("Server misconfigured: NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!key) throw new Error("Server misconfigured: SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(url, key);
}

// Every Vonage verify.start call is a billed SMS — this stops a retry loop
// or a malicious caller from running up the bill against one number.
async function checkAndRecordThrottle(
  admin: ReturnType<typeof getAdminClient>,
  phone: string
): Promise<{ allowed: boolean }> {
  const now = new Date();
  const { data: row } = await admin
    .from("phone_otp_throttle")
    .select("last_sent_at, window_start, count_in_window")
    .eq("phone", phone)
    .maybeSingle();

  if (!row) {
    await admin.from("phone_otp_throttle").insert({
      phone,
      last_sent_at: now.toISOString(),
      window_start: now.toISOString(),
      count_in_window: 1,
    });
    return { allowed: true };
  }

  const lastSentAt = new Date(row.last_sent_at).getTime();
  if (now.getTime() - lastSentAt < MIN_INTERVAL_MS) {
    return { allowed: false };
  }

  const windowStart = new Date(row.window_start).getTime();
  const windowExpired = now.getTime() - windowStart > WINDOW_MS;
  const nextCount = windowExpired ? 1 : row.count_in_window + 1;

  if (!windowExpired && nextCount > MAX_PER_WINDOW) {
    return { allowed: false };
  }

  await admin
    .from("phone_otp_throttle")
    .update({
      last_sent_at: now.toISOString(),
      window_start: windowExpired ? now.toISOString() : row.window_start,
      count_in_window: nextCount,
    })
    .eq("phone", phone);

  return { allowed: true };
}

export async function POST(request: Request) {
  const { phone } = await request.json();
  if (!phone || typeof phone !== "string") {
    return NextResponse.json({ error: "Phone number required" }, { status: 400 });
  }

  let normalized: string;
  try {
    normalized = toE164(phone);
  } catch {
    return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
  }

  const admin = getAdminClient();

  const { allowed } = await checkAndRecordThrottle(admin, normalized);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait before requesting another code." },
      { status: 429 }
    );
  }

  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("phone", normalized)
    .maybeSingle();

  try {
    const requestId = await startPhoneVerification(normalized);
    return NextResponse.json({ requestId, isNewUser: !existing });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send code" },
      { status: 500 }
    );
  }
}
