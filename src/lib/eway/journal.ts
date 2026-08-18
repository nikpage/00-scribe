import { ewayCall } from "./client";
import { summarizeBrief } from "@/lib/analysis/gemini";
import { JOURNAL_TYPES, isJournalTypeName, type JournalTypeName } from "./journal-types";

export { JOURNAL_TYPES, type JournalTypeName };

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

// Each Journal type ("SOR", "Poradna") has its own eWay WorkflowModel
// (ParentEn = that type's JournalType value), each with its own stage enum
// type. New recordings land in the "Nahráno AI" stage of whichever workflow
// matches the chosen journal type, via the standard StateEn field, same
// mechanism as TypeEn.
const JOURNAL_WORKFLOW_ENUM_BY_TYPE: Record<JournalTypeName, string> = {
  SOR: "b8793e21-2508-4470-8e64-81a9c6c90f6b",
  Poradna: "e499059e-8e6c-4dbc-ba7a-5a53384313b1",
};
const WORKFLOW_STAGE_ON_SAVE = "Nahráno AI";

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

// A person the worker can attach a journal to: either an eWay Contact
// (a client) or an eWay User (a colleague from the staff list). Both are
// searched in the same box, so they travel through the app as one type with
// a flag saying which module the GUID belongs to.
export type PersonType = "contact" | "user";

export function isPersonType(v: unknown): v is PersonType {
  return v === "contact" || v === "user";
}

// eWay folder name (module) each person type lives in — used for relations.
export const PERSON_FOLDER: Record<PersonType, string> = {
  contact: "Contacts",
  user: "Users",
};

export interface ContactOption {
  guid: string;
  name: string;
  email: string | null;
  type: PersonType;
}

// Fold diacritics and lowercase so "kolacek" matches "Koláček" — Czech names
// rely on accents the worker won't always type.
function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

// Pull the full contact list from eWay (one slow call), unfiltered. Cache this
// and filter locally rather than calling eWay on every keystroke. The display
// name is "Surname, First" so duplicates are clear.
export async function getContacts(session: string): Promise<ContactOption[]> {
  const res = await ewayCall(session, "GetContacts", {});
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
        type: "contact" as const,
      };
    })
    .filter((c) => c.guid && c.name);
}

// Pull the staff list (eWay Users) the same way, once per worker. Deactivated
// accounts (IsActive false) and technical ones (IsSystem / IsApiUser — the
// service accounts eWay creates for integrations, this app included) are left
// out: a worker must never be able to file a visit against them.
export async function getUsers(session: string): Promise<ContactOption[]> {
  const res = await ewayCall(session, "GetUsers", {});
  return asArray(res.data)
    .filter((u) => u.IsActive !== false && u.IsSystem !== true && u.IsApiUser !== true)
    .map((u) => {
      const first = str(u, "FirstName") ?? "";
      const last = str(u, "LastName") ?? "";
      const fileAs = str(u, "FileAs") ?? "";
      const name =
        last && first ? `${last}, ${first}` : fileAs || last || first || str(u, "Username") || "";
      return {
        guid: str(u, "ItemGUID") ?? "",
        name,
        email: str(u, "Email1Address"),
        type: "user" as const,
      };
    })
    .filter((u) => u.guid && u.name);
}

// Filter an already-loaded contact list by a typed query: every word (in any
// order, accent-free) must appear in the name. Cheap, runs locally.
export function filterContacts(contacts: ContactOption[], query: string): ContactOption[] {
  const tokens = fold(query).split(/\s+/).filter(Boolean);
  const matched = tokens.length
    ? contacts.filter((c) => tokens.every((t) => fold(c.name).includes(t)))
    : contacts;
  return matched.slice(0, 50);
}

// Convenience: load + filter in one go (used where caching isn't set up).
export async function searchContacts(session: string, query: string): Promise<ContactOption[]> {
  return filterContacts(await getContacts(session), query);
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
  contactType?: PersonType; // which module the GUID lives in; defaults to "contact"
  contactName?: string; // "Surname, First" — used to build the subject
  note: string; // transcribed notes -> Poznámka
  eventStart: string; // ISO
  eventEnd: string; // ISO
  subject?: string; // explicit subject overrides the generated one
  journalType?: JournalTypeName; // "SOR" | "Poradna" — defaults to JOURNAL_DEFAULTS.type
}

// Subject is "<contact last name>: <brief AI summary of the note>". The picked
// contact name is "Surname, First", so the last name is before the comma.
async function buildSubject(contactName: string | undefined, note: string): Promise<string> {
  const last = (contactName ?? "").split(",")[0]?.trim() || (contactName ?? "").trim();
  let summary = "";
  try {
    summary = await summarizeBrief(note);
  } catch {
    // Best-effort: fall back to just the name if the AI summary fails.
  }
  return summary ? `${last}: ${summary}` : last;
}

export interface SaveJournalResult {
  ok: boolean;
  journalGuid: string | null;
  contactLinked: boolean;
  returnCode: string;
  description: string | null;
  // Diagnostics so a failed link/superior is explained, not silent.
  relation?: { returnCode: string; description: string | null } | null;
  superior?: { guid: string; folder: string } | null;
  superiorLinked?: boolean;
  superiorRelation?: { returnCode: string; description: string | null } | null;
}

export async function saveJournal(
  session: string,
  input: SaveJournalInput
): Promise<SaveJournalResult> {
  const year = new Date(input.eventStart).getFullYear();
  const subject =
    input.subject?.trim() || (await buildSubject(input.contactName, input.note));

  const journalTypeName: JournalTypeName =
    input.journalType && isJournalTypeName(input.journalType)
      ? input.journalType
      : JOURNAL_DEFAULTS.type;
  const workflowEnumGuid = JOURNAL_WORKFLOW_ENUM_BY_TYPE[journalTypeName];

  const [forma, typKontaktu, cilovaSkupina, sorOblast, oblastDotazu, journalTypeGuid, workflowStage] =
    await Promise.all([
      resolveEnumValue(session, "af_41", JOURNAL_DEFAULTS.forma),
      resolveEnumValue(session, "af_50", JOURNAL_DEFAULTS.typKontaktu),
      resolveEnumValue(session, "_af_79", JOURNAL_DEFAULTS.cilovaSkupina),
      resolveEnumValue(session, "_af_105", JOURNAL_DEFAULTS.sorOblastPotreb),
      resolveEnumValue(session, "_af_42", JOURNAL_DEFAULTS.oblastDotazu),
      resolveEnumValueByType(session, JOURNAL_TYPE_ENUM, journalTypeName),
      resolveEnumValueByType(session, workflowEnumGuid, WORKFLOW_STAGE_ON_SAVE),
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
  if (journalTypeGuid) transmitObject.TypeEn = journalTypeGuid;
  // Workflow status (the "Nahráno AI" stage) is stored in StateEn.
  if (workflowStage) transmitObject.StateEn = workflowStage;

  // Superior Item ("Sociální služby <year>") is a yearly Project; look up its
  // GUID. It's linked as a relation below, not a journal column.
  const superior = await resolveSuperiorItem(session, JOURNAL_DEFAULTS.superiorName(year));

  const save = await ewayCall(session, "SaveJournal", {
    transmitObject,
    dieOnItemConflict: false,
  });
  const journalGuid = findGuid(save.raw);

  // Contact Person and Superior Item are both relations, not journal columns.
  // The eWay folder name for journals is "Journal" (singular); a superior/parent
  // link uses RelationType "SUPERIORITEM", a plain link uses "GENERAL".
  let contactLinked = false;
  let relation: { returnCode: string; description: string | null } | null = null;
  let superiorLinked = false;
  let superiorRelation: { returnCode: string; description: string | null } | null = null;
  if (save.ok && journalGuid) {
    if (input.contactGuid) {
      // RelationType "CONTACT" is what populates the journal's Contact Person
      // field; "GENERAL" only makes a loose link that leaves the field blank.
      const rel = await ewayCall(session, "SaveRelation", {
        transmitObject: {
          ItemGUID1: journalGuid,
          FolderName1: "Journal",
          ItemGUID2: input.contactGuid,
          // Staff picks are eWay Users, not Contacts — the relation has to
          // point at the module the GUID actually lives in.
          FolderName2: PERSON_FOLDER[input.contactType ?? "contact"],
          RelationType: "CONTACT",
        },
      });
      contactLinked = rel.ok;
      relation = { returnCode: rel.returnCode, description: rel.description };
    }
    if (superior) {
      const rel = await ewayCall(session, "SaveRelation", {
        transmitObject: {
          ItemGUID1: journalGuid,
          FolderName1: "Journal",
          ItemGUID2: superior.guid,
          FolderName2: superior.folder,
          RelationType: "SUPERIORITEM",
          DifferDirection: true,
        },
      });
      superiorLinked = rel.ok;
      superiorRelation = { returnCode: rel.returnCode, description: rel.description };
    }
  }

  return {
    ok: save.ok,
    journalGuid,
    contactLinked,
    returnCode: save.returnCode,
    description: save.description,
    relation,
    superior,
    superiorLinked,
    superiorRelation,
  };
}
