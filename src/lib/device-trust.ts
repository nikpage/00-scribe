import { randomBytes, createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// "One OTP per device, ever": after a device proves itself once (OTP verify,
// or new-account creation which has no OTP at all), it gets a long-lived,
// httpOnly cookie. Future logins on that device skip Vonage entirely.
// Logging out only clears the Supabase session cookie, not this one.
export const DEVICE_COOKIE_NAME = "scribe_device";
const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function readDeviceToken(request: Request): string | null {
  const header = request.headers.get("cookie") || "";
  const match = header.match(new RegExp(`(?:^|; )${DEVICE_COOKIE_NAME}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// True if the device cookie on `request` matches a stored device for
// `userId`. Touches last_used_at on a match.
export async function isDeviceTrusted(request: Request, userId: string): Promise<boolean> {
  const token = readDeviceToken(request);
  if (!token) return false;

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("trusted_devices")
    .select("id")
    .eq("user_id", userId)
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  if (!row) return false;

  await admin
    .from("trusted_devices")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", row.id);
  return true;
}

// Ensures `userId`'s current device is trusted going forward. If the
// request's cookie already matches a stored device, just refreshes it and
// returns null (nothing new for the response to set). Otherwise mints a
// fresh device token, stores its hash, and returns the cookie descriptor
// for the caller to attach to its response.
export async function ensureTrustedDevice(
  request: Request,
  userId: string
): Promise<{ name: string; value: string; maxAge: number } | null> {
  if (await isDeviceTrusted(request, userId)) return null;

  const admin = createAdminClient();
  const token = randomBytes(32).toString("hex");
  await admin.from("trusted_devices").insert({ user_id: userId, token_hash: hashToken(token) });

  return { name: DEVICE_COOKIE_NAME, value: token, maxAge: DEVICE_COOKIE_MAX_AGE };
}
