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
  forma: "Ambulantní", // af_41   Forma
  typKontaktu: "osobní", // af_50   Typ kontaktu
  cilovaSkupina: "osoba se zdravotním postižením", // _af_79  Cílová skupina
  sorOblastPotreb: "Zajištění kontaktu se společenským prostředím", // _af_105 SOR Oblast potřeb
  oblastDotazu: "SOR", // _af_42  Oblast dotazu
  type: "SOR", // standard Journal Type (TypeEn, JournalType enum)
  intervencePocet: 1, // af_54
  kontaktPocet: 0, // af_55
  // Superior item (parent), rolls over with the calendar year.
  superiorName: (year: number) => `Sociální služby ${year}`,
} as const;

// Additional-field column -> the enum type GUID it draws its values from.
// Taken from GetAdditionalFields (AssociatedEnumTypeGuid). Type-8 fields carry
// a leading underscore in their column name; type-1 fields do not.
const ENUM_TYPE_BY_COLUMN = {
  af_41: "1a99cdfc-ad97-425c-8662-2b0ec315c7b3", // Forma
  af_50: "1cda2f5d-faf2-4071-979f-2c32f30d9995", // Typ kontaktu
  _af_79: "383948c9-e4e6-4b5e-97a4-1f646d23ed0a", // Cílová skupina
  _af_105: "95b3c79d-f482-4276-84e8-34cbc4b79421", // SOR Oblast potřeb
  _af_42: "0611296b-fb1f-423d-b474-f02e22f2f19b", // Oblast dotazu
} as const;

// The standard Journal "Type" field draws from the JournalType enum.
const JOURNAL_TYPE_ENUM = "c6773175-a570-4c24-b4d2-a4f6c3d9a64b";

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

async function resolveEnumValueByType(
  session: string,
  enumTypeGuid: string,
  label: string
): Promise<string | null> {
  const values = await loadEnumValues(session, enumTypeGuid);
  const wanted = label.trim().toLowerCase();
  const match = values.find((v) =>
    ["FileAs", "En", "Cz", "EnumName"].some((k) => str(v, k)?.trim().toLowerCase() === wanted)
  );
  return match ? str(match, "ItemGUID") ?? str(match, "EnumValueGuid") : null;
}

function resolveEnumValue(
  session: string,
  column: keyof typeof ENUM_TYPE_BY_COLUMN,
  label: string
): Promise<string | null> {
  return resolveEnumValueByType(session, ENUM_TYPE_BY_COLUMN[column], label);
}

export interface ContactOption {
  guid: string;
  name: string;
  email: string | null;
}

// Fold diacritics and lowercase so "kolacek" matches "Koláček" — Czech names
// rely on accents the worker won't always type.
function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

// Pull contacts so the worker can search by name. We fetch the contact list and
// filter here: every word typed (in any order, accent-free) must appear in the
// contact's first/last/FileAs. The display name shows surname + first name so
// two "Koláček"s are distinguishable.
export async function searchContacts(
  session: string,
  query: string
): Promise<ContactOption[]> {
  const res = await ewayCall(session, "GetContacts", {});
  const tokens = fold(query).split(/\s+/).filter(Boolean);
  return asArray(res.data)
    .map((c) => {
      const first = str(c, "FirstName") ?? "";
      const last = str(c, "LastName") ?? "";
      const fileAs = str(c, "FileAs") ?? "";
      const name = last && first ? `${last}, ${first}` : fileAs || last || first;
      return {
        guid: str(c, "ItemGUID") ?? "",
        name,
        email: str(c, "Email1Address"),
        haystack: fold(`${fileAs} ${first} ${last}`),
      };
    })
    .filter((c) => c.guid && c.name && tokens.every((t) => c.haystack.includes(t)))
    .slice(0, 50)
    .map(({ guid, name, email }) => ({ guid, name, email }));
}

// The Superior Item ("Sociální služby <year>") is another eWay record, so the
// API needs its GUID, not the numeric id shown in the UI. Look it up by name —
// it's a yearly Project — falling back to Journals if it isn't a Project.
async function resolveSuperiorItem(
  session: string,
  name: string
): Promise<{ guid: string; folder: string } | null> {
  const wanted = name.trim().toLowerCase();
  for (const [method, folder] of [
    ["GetProjects", "Projects"],
    ["GetJournals", "Journals"],
  ] as const) {
    const res = await ewayCall(session, method, {});
    const match = asArray(res.data).find(
      (i) => str(i, "FileAs")?.trim().toLowerCase() === wanted
    );
    const guid = match ? str(match, "ItemGUID") : null;
    if (guid) return { guid, folder };
  }
  return null;
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

  const [forma, typKontaktu, cilovaSkupina, sorOblast, oblastDotazu, journalType] =
    await Promise.all([
      resolveEnumValue(session, "af_41", JOURNAL_DEFAULTS.forma),
      resolveEnumValue(session, "af_50", JOURNAL_DEFAULTS.typKontaktu),
      resolveEnumValue(session, "_af_79", JOURNAL_DEFAULTS.cilovaSkupina),
      resolveEnumValue(session, "_af_105", JOURNAL_DEFAULTS.sorOblastPotreb),
      resolveEnumValue(session, "_af_42", JOURNAL_DEFAULTS.oblastDotazu),
      resolveEnumValueByType(session, JOURNAL_TYPE_ENUM, JOURNAL_DEFAULTS.type),
    ]);

  // Custom (af_NN) fields live under AdditionalFields, not as top-level columns.
  // Keys never carry the leading underscore there. Type-1 enums take a single
  // value GUID; Type-8 enums (Cílová skupina, SOR Oblast potřeb, Oblast dotazu)
  // are multi-value and take an array of GUIDs.
  const additionalFields: Record<string, unknown> = {
    af_54: JOURNAL_DEFAULTS.intervencePocet,
    af_55: JOURNAL_DEFAULTS.kontaktPocet,
  };
  if (forma) additionalFields.af_41 = forma; // Type-1
  if (typKontaktu) additionalFields.af_50 = typKontaktu; // Type-1
  if (cilovaSkupina) additionalFields.af_79 = [cilovaSkupina]; // Type-8
  if (sorOblast) additionalFields.af_105 = [sorOblast]; // Type-8
  if (oblastDotazu) additionalFields.af_42 = [oblastDotazu]; // Type-8

  const transmitObject: Record<string, unknown> = {
    FileAs: subject,
    Subject: subject,
    Note: input.note,
    EventStart: input.eventStart,
    EventEnd: input.eventEnd,
    AdditionalFields: additionalFields,
  };
  // Standard Journal "Type" (the dropdown at the top) is stored in TypeEn.
  if (journalType) transmitObject.TypeEn = journalType;

  // Superior Item ("Sociální služby <year>") — looked up by name to get its
  // GUID, then set as the journal's superior.
  const superior = await resolveSuperiorItem(session, JOURNAL_DEFAULTS.superiorName(year));
  if (superior) {
    transmitObject.Superior_ItemGUID = superior.guid;
    transmitObject.Superior_FolderName = superior.folder;
  }

  const save = await ewayCall(session, "SaveJournal", {
    transmitObject,
    dieOnItemConflict: false,
  });
  const journalGuid = findGuid(save.raw);

  // Attach the Journal to the chosen contact. eWay models this as a relation
  // between the Journal and the Contact folders.
  let contactLinked = false;
  if (save.ok && journalGuid && input.contactGuid) {
    // Per eWay's own library: the relation goes under transmitObject with
    // PascalCase keys and RelationType "GENERAL".
    const rel = await ewayCall(session, "SaveRelation", {
      transmitObject: {
        ItemGUID1: journalGuid,
        FolderName1: "Journals",
        ItemGUID2: input.contactGuid,
        FolderName2: "Contacts",
        RelationType: "GENERAL",
      },
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
