import { Vonage } from "@vonage/server-sdk";
import { Channels } from "@vonage/verify2";

let client: Vonage | null = null;

function getClient(): Vonage {
  if (client) return client;

  // This account authenticates Verify v2 with JWT application credentials
  // (application id + private key), not the legacy API key/secret. Prefer those;
  // fall back to key/secret only if that's all that's configured.
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
    "Server misconfigured: set VONAGE_LIGA_SCRIBE_APPLICATION_ID + VONAGE_PRIVATE_KEY (or VONAGE_API_KEY + VONAGE_API_SECRET)"
  );
}

// E.164 without the leading '+', per Vonage's `to` field requirement.
export function toE164(phone: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  if (!digits) throw new Error("Invalid phone number");
  return digits;
}

export async function startPhoneVerification(phone: string): Promise<string> {
  const templateId = process.env.VONAGE_SMS_TEMPLATE_ID;
  const { requestId } = await getClient().verify2.newRequest({
    brand: process.env.VONAGE_BRAND_NAME || "Scribe",
    workflow: [{ channel: Channels.SMS, to: toE164(phone) }],
    codeLength: 6,
    channelTimeout: 300,
    // Without this, the SMS body is Vonage's default text and WebOTP
    // auto-fill won't fire — see scripts/setup-vonage-webotp-template.mjs.
    ...(templateId ? { templateId } : {}),
  });
  return requestId;
}

// Vonage resolves to "completed" on a correct code; anything else (or a
// thrown error on bad/expired code) counts as not-verified.
export async function checkPhoneVerification(
  requestId: string,
  code: string
): Promise<boolean> {
  try {
    const status = await getClient().verify2.checkCode(requestId, code);
    return status === "completed";
  } catch {
    return false;
  }
}
