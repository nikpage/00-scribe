// Client-safe journal-type constants, shared by the record page and the
// eWay journal card. Kept separate from journal.ts, which pulls in
// server-only eWay/Gemini code.

export const JOURNAL_TYPES = ["SOR", "Poradna"] as const;
export type JournalTypeName = (typeof JOURNAL_TYPES)[number];

export const JOURNAL_TYPE_STORAGE_KEY = "scribe-eway-journal-type";

export function isJournalTypeName(v: string): v is JournalTypeName {
  return (JOURNAL_TYPES as readonly string[]).includes(v);
}

export function loadStoredJournalType(): JournalTypeName {
  if (typeof window === "undefined") return "SOR";
  const stored = localStorage.getItem(JOURNAL_TYPE_STORAGE_KEY);
  return stored && isJournalTypeName(stored) ? stored : "SOR";
}

export function storeJournalType(type: JournalTypeName): void {
  localStorage.setItem(JOURNAL_TYPE_STORAGE_KEY, type);
}
