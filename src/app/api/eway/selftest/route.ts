import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { ewayCall } from "@/lib/eway/client";

// GET /api/eway/selftest?user=<eway-username>&pass=<eway-password>
//
// One-shot live test. Logs in with the supplied eWay credentials (using the
// EWAY_SERVICE_URL configured in Vercel), inserts a clearly-labelled test
// Journal, then reads it back by its returned GUID. Nothing is stored — the
// credentials are used only for this request. Returns yes/no plus the raw
// eWay responses so we can see the real field codes.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const user = searchParams.get("user");
  const pass = searchParams.get("pass");
  if (!user || !pass) {
    return NextResponse.json({ error: "Add ?user=...&pass=... to the URL" }, { status: 400 });
  }

  // Raw login so we can read the exact session field name from eWay's reply.
  const serviceUrl = (process.env.EWAY_SERVICE_URL ?? "").replace(/\/+$/, "");
  const loginRes = await fetch(`${serviceUrl}/API.svc/LogIn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userName: user,
      passwordHash: createHash("md5").update(pass, "utf8").digest("hex"),
      appVersion: "Scribe1.0",
      clientMachineIdentifier: "scribe-server",
    }),
  });
  const loginRaw = (await loginRes.json()) as Record<string, unknown>;

  // Find whichever key carries the session id, without assuming its name.
  const sessionEntry = Object.entries(loginRaw).find(
    ([k, v]) => typeof v === "string" && /session/i.test(k) && (v as string).length > 0
  );
  const session = sessionEntry ? (sessionEntry[1] as string) : null;

  if (!session) {
    return NextResponse.json({ step: "login", loginRaw }, { status: 502 });
  }

  const stamp = new Date();
  const start = stamp.toISOString();
  const end = new Date(stamp.getTime() + 30 * 60 * 1000).toISOString();

  // Insert a minimal, obviously-test journal using the standard fields.
  const save = await ewayCall(session, "SaveJournal", {
    transmitObject: {
      FileAs: "SCRIBE SELF-TEST — delete me",
      Subject: "SCRIBE SELF-TEST — delete me",
      Note: "Created by Scribe self-test. Safe to delete.",
      EventStart: start,
      EventEnd: end,
    },
    dieOnItemConflict: false,
  });

  // The created GUID may sit anywhere in the response; find the first string
  // value under a key that looks like a GUID, without assuming the key name.
  let guid: string | null = null;
  if (save.raw && typeof save.raw === "object") {
    const entry = Object.entries(save.raw as Record<string, unknown>).find(
      ([k, v]) => typeof v === "string" && /guid/i.test(k) && (v as string).length > 0
    );
    if (entry) guid = entry[1] as string;
  }

  // Read it back to confirm it actually landed.
  let readBack: unknown = null;
  if (save.ok && typeof guid === "string") {
    const got = await ewayCall(session, "GetJournalsByItemGuids", { itemGuids: [guid] });
    readBack = got;
  }

  // Pull eWay's own field + enum definitions so we can map the custom slots
  // (af_NN) to Oblast potreb / Forma / Typ and read their value IDs. The raw
  // catalogs are huge (every record carries dozens of GUID/timestamp columns),
  // so keep only the few keys that actually matter for the mapping.
  //
  // GetEnumTypes only returns the enum *headers* (GUID + name); the actual
  // selectable values (the IDs we write into a journal) come from
  // GetEnumValues, so we fetch those too and group them by their enum type.
  const additionalFields = await ewayCall(session, "GetAdditionalFields", {});
  const enumTypes = await ewayCall(session, "GetEnumTypes", {});
  const enumValues = await ewayCall(session, "GetEnumValues", {});

  const pick = (obj: unknown, keys: string[]) => {
    if (!obj || typeof obj !== "object") return obj as Record<string, unknown>;
    const src = obj as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of keys) if (k in src && src[k] != null) out[k] = src[k];
    return out;
  };
  const asArray = (data: unknown) => (Array.isArray(data) ? (data as unknown[]) : []);
  const str = (obj: unknown, key: string) => {
    const v = obj && typeof obj === "object" ? (obj as Record<string, unknown>)[key] : null;
    return typeof v === "string" ? v : null;
  };

  // Keep ObjectType so Journal fields can be told apart from Users/Contacts.
  const fields = asArray(additionalFields.data).map((f) =>
    pick(f, [
      "ColumnName",
      "FieldId",
      "Name",
      "FileAs",
      "Type",
      "AssociatedEnumTypeGuid",
      "ObjectTypeFolderName",
      "ObjectTypeId",
    ])
  );

  // Group the flat value list under the enum type it belongs to, so each
  // dropdown shows its options (value GUID + label + rank) in one place.
  const valuesByType = new Map<string, Record<string, unknown>[]>();
  for (const v of asArray(enumValues.data)) {
    const typeGuid = str(v, "EnumTypeGuid") ?? str(v, "EnumType") ?? str(v, "AssociatedEnumTypeGuid");
    if (!typeGuid) continue;
    const compact = pick(v, ["ItemGUID", "EnumValueGuid", "FileAs", "En", "Cz", "Rank", "IsDefault", "IsVisible"]);
    const bucket = valuesByType.get(typeGuid) ?? [];
    bucket.push(compact);
    valuesByType.set(typeGuid, bucket);
  }

  const enums = asArray(enumTypes.data).map((e) => {
    const head = pick(e, ["ItemGUID", "EnumName", "FileAs"]);
    const guid = str(head, "ItemGUID");
    return { ...head, values: guid ? valuesByType.get(guid) ?? [] : [] };
  });

  return NextResponse.json({
    loggedIn: true,
    inserted: save.ok,
    insertedGuid: guid,
    confirmedPresent:
      readBack !== null &&
      typeof readBack === "object" &&
      (readBack as { ok?: boolean }).ok === true,
    counts: {
      additionalFields: fields.length,
      enumTypes: enums.length,
      enumValues: asArray(enumValues.data).length,
      groupedValueTypes: valuesByType.size,
    },
    // One untouched value row so we can read GetEnumValues' real key names if
    // the grouping above came back empty (i.e. my key guesses were wrong).
    enumValueSample: asArray(enumValues.data)[0] ?? null,
    definitions: { additionalFields: fields, enumTypes: enums },
  });
}
