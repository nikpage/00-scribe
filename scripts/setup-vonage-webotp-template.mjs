// One-off script: creates a Vonage Verify2 SMS template whose text ends
// with the "@domain #code" suffix WebOTP requires to auto-fill the code on
// Android Chrome. Run once, then put the printed template ID in
// VONAGE_SMS_TEMPLATE_ID (local env + Vercel) so login/route reads use it.
//
// Usage: node scripts/setup-vonage-webotp-template.mjs
// The Templates API requires JWT auth (application ID + private key), not
// the API key/secret used everywhere else — so this needs both:
//   VONAGE_LIGA_SCRIBE_APPLICATION_ID
//   VONAGE_PRIVATE_KEY (contents of the downloaded private.key)
// plus WEBOTP_DOMAIN (defaults to 00-scribe.vercel.app — set this to your
// real production domain if different).

import { Vonage } from "@vonage/server-sdk";

const applicationId = process.env.VONAGE_LIGA_SCRIBE_APPLICATION_ID;
const privateKey = process.env.VONAGE_PRIVATE_KEY;
const domain = process.env.WEBOTP_DOMAIN || "00-scribe.vercel.app";

if (!applicationId || !privateKey) {
  console.error("Set VONAGE_LIGA_SCRIBE_APPLICATION_ID and VONAGE_PRIVATE_KEY first.");
  process.exit(1);
}

const vonage = new Vonage({ applicationId, privateKey });

const template = await vonage.verify2.createTemplate({
  name: "scribe-webotp-sms",
  isDefault: false,
});

// The last line must be exactly "@<domain> #<code>" with no extra text
// after it — that's what the WebOTP spec parses.
const text = `\${code} je váš kód pro Scribe.\n\n@${domain} #\${code}`;

await vonage.verify2.createTemplateFragment(template.templateId, {
  channel: "sms",
  locale: "cs-cz",
  text,
});

await vonage.verify2.createTemplateFragment(template.templateId, {
  channel: "sms",
  locale: "en-us",
  text: `\${code} is your Scribe code.\n\n@${domain} #\${code}`,
});

console.log("Template created. Set this in your env:");
console.log(`VONAGE_SMS_TEMPLATE_ID=${template.templateId}`);
