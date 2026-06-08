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
  const additionalFields = await ewayCall(session, "GetAdditionalFields", {});
  const enumTypes = await ewayCall(session, "GetEnumTypes", {});

  const pick = (obj: unknown, keys: string[]) => {
    if (!obj || typeof obj !== "object") return obj;
    const src = obj as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of keys) if (k in src && src[k] != null) out[k] = src[k];
    return out;
  };
  const asArray = (data: unknown) => (Array.isArray(data) ? data : []);

  const fields = asArray(additionalFields.data).map((f) =>
    pick(f, ["ColumnName", "FieldId", "Name", "FileAs", "Type", "AssociatedEnumTypeGuid"])
  );
  const enums = asArray(enumTypes.data).map((e) =>
    pick(e, ["ItemGUID", "EnumName", "Name", "FileAs", "EnumValues", "EnumValue"])
  );

  return NextResponse.json({
    loggedIn: true,
    inserted: save.ok,
    insertedGuid: guid,
    confirmedPresent:
      readBack !== null &&
      typeof readBack === "object" &&
      (readBack as { ok?: boolean }).ok === true,
    counts: { additionalFields: fields.length, enumTypes: enums.length },
    definitions: { additionalFields: fields, enumTypes: enums },
  });
}
