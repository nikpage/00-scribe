import { ewayCall } from "./client";

// Building and saving the "social services" contact Journal in eWay.
//
// Most of the Journal's fields are fixed defaults that match the standard form
// the workers use (see the reference screenshot). The only parts that vary per
// visit are: the contact it attaches to, the date/time, and the Poznámka (the
// transcribed notes). Everything else comes from JOURNAL_DEFAULTS below.
//
// Dropdown values are kept here as their human-readable labels and resolved to
// eWay's value GUIDs at save time (via GetEnumValues), so nothing is pinned to
// an opaque id and the labels stay editable in one obvious place.

// Fixed dropdown values, by their visible label in eWay.
export const JOURNAL_DEFAULTS = {
  forma: "Ambulantní", // af_41  (enum AF_41)
  typKontaktu: "osobní", // af_50  (enum AF_50)
  cilovaSkupina: "osoba se zdravotním postižením", // _af_79 (enum AF_79)
  intervencePocet: 1, // af_54
  kontaktPocet: 0, // af_55
  // Nadřazená položka (parent item) rolls over with the calendar year.
  superiorName: (year: number) => `Sociální služby ${year}`,
} as const;

// Additional-field column -> the enum type GUID it draws its values from.
// Taken from GetAdditionalFields (AssociatedEnumTypeGuid). Type-8 fields carry
// a leading underscore in their column name; type-1 fields do not.
const ENUM_TYPE_BY_COLUMN = {
  af_41: "1a99cdfc-ad97-425c-8662-2b0ec315c7b3", // Forma
  af_50: "1cda2f5d-faf2-4071-979f-2c32f30d9995", // Typ kontaktu
  _af_79: "383948c9-e4e6-4b5e-97a4-1f646d23ed0a", // Cílová skupina
} as const;

function asArray(data: unknown): Record<string, unknown>[] {
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

function str(obj: Record<string, unknown> | undefined, key: string): string | null {
  const v = obj?.[key];
  return typeof v === "string" ? v : null;
}

// Find the first string value under a key matching /guid/i — the created item's
// GUID can sit under different key names depending on the method.
function findGuid(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = Object.entries(raw as Record<string, unknown>).find(
    ([k, v]) => typeof v === "string" && /guid/i.test(k) && v.length > 0
  );
  return entry ? (entry[1] as string) : null;
}

// Resolve a dropdown label to its eWay value GUID within a given enum type.
// GetEnumValues returns every value across all types, so we filter to the
// requested type and match the label case-insensitively against the common
// label keys (FileAs / En / Cz). Cached per session+type to avoid refetching.
const enumCache = new Map<string, Record<string, unknown>[]>();

async function loadEnumValues(
  session: string,
  enumTypeGuid: string
): Promise<Record<string, unknown>[]> {
  const cached = enumCache.get(enumTypeGuid);
  if (cached) return cached;
  const res = await ewayCall(session, "GetEnumValues", {});
  const all = asArray(res.data);
  const forType = all.filter((v) => {
    const t =
      str(v, "EnumTypeGuid") ?? str(v, "EnumType") ?? str(v, "AssociatedEnumTypeGuid");
    return t === enumTypeGuid;
  });
  enumCache.set(enumTypeGuid, forType);
  return forType;
}

async function resolveEnumValue(
  session: string,
  column: keyof typeof ENUM_TYPE_BY_COLUMN,
  label: string
): Promise<string | null> {
  const values = await loadEnumValues(session, ENUM_TYPE_BY_COLUMN[column]);
  const wanted = label.trim().toLowerCase();
  const match = values.find((v) =>
    ["FileAs", "En", "Cz", "EnumName"].some((k) => str(v, k)?.trim().toLowerCase() === wanted)
  );
  return match ? str(match, "ItemGUID") ?? str(match, "EnumValueGuid") : null;
}

export interface ContactOption {
  guid: string;
  name: string;
  email: string | null;
}

// Pull contacts so the worker can search by name. eWay's SearchContacts does an
// AND-match on the fields given; for a free-text "type a name" picker we fetch
// the contact list and filter here, which is simpler and matches partials.
export async function searchContacts(
  session: string,
  query: string
): Promise<ContactOption[]> {
  const res = await ewayCall(session, "GetContacts", {});
  const q = query.trim().toLowerCase();
  return asArray(res.data)
    .map((c) => ({
      guid: str(c, "ItemGUID") ?? "",
      name: str(c, "FileAs") ?? "",
      email: str(c, "Email1Address"),
    }))
    .filter((c) => c.guid && (!q || c.name.toLowerCase().includes(q)))
    .slice(0, 50);
}

export interface SaveJournalInput {
  contactGuid: string;
  note: string; // transcribed notes -> Poznámka
  eventStart: string; // ISO
  eventEnd: string; // ISO
  subject?: string;
}

export interface SaveJournalResult {
  ok: boolean;
  journalGuid: string | null;
  contactLinked: boolean;
  returnCode: string;
  description: string | null;
}

export async function saveJournal(
  session: string,
  input: SaveJournalInput
): Promise<SaveJournalResult> {
  const year = new Date(input.eventStart).getFullYear();
  const subject = input.subject ?? JOURNAL_DEFAULTS.superiorName(year);

  const [forma, typKontaktu, cilovaSkupina] = await Promise.all([
    resolveEnumValue(session, "af_41", JOURNAL_DEFAULTS.forma),
    resolveEnumValue(session, "af_50", JOURNAL_DEFAULTS.typKontaktu),
    resolveEnumValue(session, "_af_79", JOURNAL_DEFAULTS.cilovaSkupina),
  ]);

  // Additional fields are set as columns directly on the transmit object.
  const transmitObject: Record<string, unknown> = {
    FileAs: subject,
    Subject: subject,
    Note: input.note,
    EventStart: input.eventStart,
    EventEnd: input.eventEnd,
    af_54: JOURNAL_DEFAULTS.intervencePocet,
    af_55: JOURNAL_DEFAULTS.kontaktPocet,
  };
  if (forma) transmitObject.af_41 = forma;
  if (typKontaktu) transmitObject.af_50 = typKontaktu;
  if (cilovaSkupina) transmitObject._af_79 = cilovaSkupina;

  const save = await ewayCall(session, "SaveJournal", {
    transmitObject,
    dieOnItemConflict: false,
  });
  const journalGuid = findGuid(save.raw);

  // Attach the Journal to the chosen contact. eWay models this as a relation
  // between the Journal and the Contact folders.
  let contactLinked = false;
  if (save.ok && journalGuid && input.contactGuid) {
    const rel = await ewayCall(session, "SaveRelation", {
      itemGuid1: journalGuid,
      folderName1: "Journals",
      itemGuid2: input.contactGuid,
      folderName2: "Contacts",
      relationType: "GENERAL_RELATION",
      differDirection: true,
    });
    contactLinked = rel.ok;
  }

  return {
    ok: save.ok,
    journalGuid,
    contactLinked,
    returnCode: save.returnCode,
    description: save.description,
  };
}
