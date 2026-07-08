import { Vonage } from "@vonage/server-sdk";
import { SMS } from "@vonage/messages";
import crypto from "crypto";

let client: Vonage | null = null;

function getClient(): Vonage {
  if (client) return client;

  // The Messages API (used to send our own OTP SMS) authenticates with a JWT
  // signed by a Vonage Application's private key. Prefer those; fall back to
  // key/secret only if that's all that's configured.
  const applicationId = process.env.VONAGE_LIGA_SCRIBE_APPLICATION_ID;
  const privateKey = process.env.VONAGE_PRIVATE_KEY;
  const apiKey = process.env.VONAGE_API_KEY;
  const apiSecret = process.env.VONAGE_API_SECRET;

  if (applicationId && privateKey) {
    // Env vars often store the PEM with escaped newlines — normalize them.
    client = new Vonage({ applicationId, privateKey: privateKey.replace(/\\n/g, "\n") });
    return client;
  }

  if (apiKey && apiSecret) {
    client = new Vonage({ apiKey, apiSecret });
    return client;
  }

  throw new Error(
    "Server misconfigured: set VONAGE_LIGA_SCRIBE_APPLICATION_ID + VONAGE_PRIVATE_KEY"
  );
}

// E.164 without the leading '+', per Vonage's `to` field requirement.
export function toE164(phone: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  if (!digits) throw new Error("Invalid phone number");
  return digits;
}

// --- Self-managed OTP -------------------------------------------------------
//
// We generate and send the code ourselves (instead of Vonage Verify) so we
// control the exact SMS text. Ending the SMS with the WebOTP line
// "@<domain> #<code>" is what lets the phone read the code and offer it as a
// one-tap / auto-fill — the whole reason for owning the message body.
//
// No database is used: start() returns a signed, self-contained token that
// encodes the phone + expiry, bound to the code via HMAC. verify() recomputes
// the HMAC from the submitted code and checks it. The signing key never leaves
// the server, so the token can't be forged or brute-forced offline.

const CODE_TTL_MS = 5 * 60 * 1000;

function signingSecret(): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Server misconfigured: SUPABASE_SERVICE_ROLE_KEY not set");
  return secret;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function hmac(phone: string, exp: number, code: string): string {
  return crypto
    .createHmac("sha256", signingSecret())
    .update(`${phone}.${exp}.${code}`)
    .digest("base64url");
}

function generateCode(): string {
  // 6 digits, cryptographically random, zero-padded.
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

// The domain the WebOTP code is bound to — must be the app's exact host so the
// browser matches the SMS to this origin. Reuses the passkey RP id.
function webOtpDomain(): string {
  return process.env.WEBAUTHN_RP_ID || "";
}

async function sendSms(phone: string, text: string): Promise<void> {
  const from = process.env.VONAGE_SMS_FROM || process.env.VONAGE_BRAND_NAME || "Scribe";
  await getClient().messages.send(new SMS(text, phone, from));
}

// Generates a code, texts it, and returns an opaque token the client hands back
// on verify. The token is `base64url({phone,exp}).hmac`.
export async function startPhoneVerification(phone: string): Promise<string> {
  const code = generateCode();
  const exp = Date.now() + CODE_TTL_MS;
  const brand = process.env.VONAGE_BRAND_NAME || "Scribe";

  const domain = webOtpDomain();
  // The trailing "@domain #code" line is the WebOTP contract; it's what makes
  // the phone auto-offer the code. Kept on its own line at the very end.
  const webOtpLine = domain ? `\n\n@${domain} #${code}` : "";
  const text = `${code} is your ${brand} login code.${webOtpLine}`;

  await sendSms(phone, text);

  const payload = b64url(JSON.stringify({ phone, exp }));
  const sig = hmac(phone, exp, code);
  return `${payload}.${sig}`;
}

// Verifies the submitted code against the token. Returns true only if the token
// is well-formed, unexpired, for this phone, and the code matches.
export function checkPhoneVerification(
  token: string,
  code: string,
  phone: string
): boolean {
  try {
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return false;

    const { phone: tokenPhone, exp } = JSON.parse(
      Buffer.from(payload, "base64url").toString()
    ) as { phone: string; exp: number };

    if (tokenPhone !== phone) return false;
    if (Date.now() > exp) return false;

    const expected = hmac(phone, exp, code.trim());
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
