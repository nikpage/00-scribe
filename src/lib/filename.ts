export function generateFilename(label: string): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const time = now.toTimeString().slice(0, 5).replace(":", "");
  // Supabase Storage keys must be plain ASCII, so fold Czech diacritics down
  // (ř -> r, á -> a) before stripping anything else. Keeping the accented
  // letters produced "Invalid key" on upload.
  const sanitized = label
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]/g, "");
  return `${sanitized}_${date}_${time}`;
}
