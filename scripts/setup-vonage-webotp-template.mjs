// One-off script: creates a Vonage Verify2 SMS template whose text ends
// with the "@domain #code" suffix WebOTP requires to auto-fill the code on
// Android Chrome. Run once, then put the printed template ID in
// VONAGE_SMS_TEMPLATE_ID (local env + Vercel) so login/route reads use it.
//
// Usage: node scripts/setup-vonage-webotp-template.mjs
// Requires VONAGE_API_KEY / VONAGE_API_SECRET in the environment, and
// WEBOTP_DOMAIN (defaults to 00-scribe.vercel.app — set this to your real
// production domain if different).

import { Vonage } from "@vonage/server-sdk";

const apiKey = process.env.VONAGE_API_KEY;
const apiSecret = process.env.VONAGE_API_SECRET;
const domain = process.env.WEBOTP_DOMAIN || "00-scribe.vercel.app";

if (!apiKey || !apiSecret) {
  console.error("Set VONAGE_API_KEY and VONAGE_API_SECRET first.");
  process.exit(1);
}

const vonage = new Vonage({ apiKey, apiSecret });

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
