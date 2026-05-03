// Client name normalization. Mirrors the SQL normalize_client_name() function.
// Lowercase, strip commas, sort whitespace-split tokens. Diacritics preserved.
export function normalizeClientName(input: string): string {
  return input
    .toLowerCase()
    .replace(/,/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}
