import { Vonage } from "@vonage/server-sdk";
import { Channels } from "@vonage/verify2";

// Desktop phone login: send + check an OTP via Vonage Verify v2. Uses the
// default (boilerplate) SMS template — no custom template or support
// enablement needed, just the Application ID + private key already required
// for Verify v2's JWT auth (see .env.example).

let client: Vonage | null = null;

function getClient(): Vonage {
  if (client) return client;
  const applicationId = process.env.VONAGE_LIGA_SCRIBE_APPLICATION_ID;
  const privateKey = process.env.VONAGE_PRIVATE_KEY;
  if (!applicationId || !privateKey) {
    throw new Error(
      "VONAGE_LIGA_SCRIBE_APPLICATION_ID and VONAGE_PRIVATE_KEY are required for phone login"
    );
  }
  client = new Vonage({ applicationId, privateKey });
  return client;
}

export async function startPhoneVerification(phoneE164: string): Promise<string> {
  const vonage = getClient();
  const from = process.env.VONAGE_SMS_FROM || process.env.VONAGE_BRAND_NAME || "Scribe";
  const { requestId } = await vonage.verify2.newRequest({
    brand: process.env.VONAGE_BRAND_NAME || "Scribe",
    workflow: [
      {
        channel: Channels.SMS,
        to: phoneE164.replace(/^\+/, ""),
        from,
      },
    ],
    locale: "cs-cz",
  });
  return requestId;
}

// Vonage's checkCode resolves for a valid code and throws for an invalid or
// expired one — normalize both into a boolean so callers don't need to know
// that.
export async function checkPhoneVerification(requestId: string, code: string): Promise<boolean> {
  const vonage = getClient();
  try {
    await vonage.verify2.checkCode(requestId, code);
    return true;
  } catch {
    return false;
  }
}
