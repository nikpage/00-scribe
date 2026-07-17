// Czech-first phone normalization: workers type local numbers with no
// country code, sometimes with spaces or a leading 00/+. This is the single
// source of truth for turning any of those into E.164 (+420XXXXXXXXX) so
// storage, lookup, and the Vonage SMS API all agree on one format.
export function normalizePhoneE164(raw: string): string {
  let digits = raw.replace(/[^\d]/g, "");
  digits = digits.replace(/^00/, ""); // 00420... -> 420...
  if (!digits.startsWith("420")) digits = `420${digits}`;
  return `+${digits}`;
}
