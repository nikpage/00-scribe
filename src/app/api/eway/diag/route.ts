import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/eway/crypto";
import { ewayLogin, ewayCall } from "@/lib/eway/client";
import { getUsers, getContacts } from "@/lib/eway/journal";

// GET /api/eway/diag — TEMPORARY introspection of the live eWay service.
//
// Logs in with the signed-in worker's saved eWay credentials and dumps a
// couple of real Journal records plus the custom-field and enum definitions.
// The point is to read the exact field codes (standard *and* the social-
// services custom fields like Oblast potreb / Forma / Typ) and the enum value
// IDs straight from the live instance, so the real save flow can be built
// against the truth instead of guesses.
//
// This route exists only to discover the shape of the data and is removed once
// the journal integration is finished.

async function safe(label: string, fn: () => Promise<unknown>) {
  try {
    return { [label]: await fn() };
  } catch (err) {
    return { [label]: { error: err instanceof Error ? err.message : String(err) } };
  }
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: row, error: fetchErr } = await admin
    .from("eway_credentials")
    .select("username, password_ciphertext, password_iv, password_tag")
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!row) {
    return NextResponse.json(
      { error: "No eWay account connected. Connect one in settings first." },
      { status: 404 }
    );
  }

  let password: string;
  try {
    password = decryptSecret({
      ciphertext: row.password_ciphertext,
      iv: row.password_iv,
      tag: row.password_tag,
    });
  } catch (err) {
    return NextResponse.json(
      { step: "decrypt", error: err instanceof Error ? err.message : "Decryption failed" },
      { status: 500 }
    );
  }

  const login = await ewayLogin(row.username, password);
  if (!login.ok || !login.sessionId) {
    return NextResponse.json({ step: "login", login }, { status: 502 });
  }
  const session = login.sessionId;

  // If ?journal=<guid> is given, read that one journal back and return only its
  // populated columns — the quickest way to learn the exact field keys eWay
  // uses for Type, Superior Item, Contact Person, etc. on a real record.
  const journalGuid = new URL(request.url).searchParams.get("journal");
  if (journalGuid) {
    const got = await ewayCall(session, "GetJournalsByItemGuids", {
      itemGuids: [journalGuid],
      includeForeignKeys: true,
      includeRelations: true,
    });
    const rec = Array.isArray(got.data) ? (got.data[0] as Record<string, unknown>) : null;
    const populated: Record<string, unknown> = {};
    if (rec) {
      for (const [k, v] of Object.entries(rec)) {
        if (v !== null && v !== "" && !(Array.isArray(v) && v.length === 0)) populated[k] = v;
      }
    }
    return NextResponse.json({ journalGuid, returnCode: got.returnCode, populated });
  }

  // TEMPORARY: ?overlap=1 — how many of the live staff also exist as Contacts,
  // i.e. how often the merged picker shows the same person twice.
  if (new URL(request.url).searchParams.get("overlap") === "1") {
    const [users, contacts] = await Promise.all([getUsers(session), getContacts(session)]);
    const fold = (x: string) => x.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    const contactNames = new Set(contacts.map((c) => fold(c.name)));
    const byName = new Map(contacts.map((c) => [fold(c.name), c]));
    const both = users
      .filter((u) => contactNames.has(fold(u.name)))
      .map((u) => {
        const c = byName.get(fold(u.name));
        return {
          name: u.name,
          staffEmail: u.email,
          contactEmail: c?.email ?? null,
          sameEmail:
            !!u.email && !!c?.email && u.email.trim().toLowerCase() === c.email.trim().toLowerCase(),
        };
      });
    return NextResponse.json({ staff: users.length, alsoContacts: both.length, both });
  }

  // TEMPORARY: ?tasktest=1 — find which field SaveTask is refusing.
  // Saves the same task four times, adding one group of fields each round, and
  // returns eWay's raw answer for each. Creates real tasks (assigned to the
  // caller, subject prefixed TEST-SCRIBE) — delete them in eWay afterwards.
  if (new URL(request.url).searchParams.get("tasktest") === "1") {
    const solver = new URL(request.url).searchParams.get("solver") ?? "";
    if (!solver) {
      return NextResponse.json({ error: "Pass ?solver=<eWay user guid>" }, { status: 400 });
    }
    const PROJECT = "f8c3120c-a2af-11f1-a019-8b0d307348be";
    const base: Record<string, unknown> = {
      FileAs: "TEST-SCRIBE 1 bare",
      Subject: "TEST-SCRIBE 1 bare",
      Users_TaskSolverGuid: solver,
    };
    const variants: { label: string; obj: Record<string, unknown> }[] = [
      { label: "1-bare", obj: { ...base } },
      {
        label: "2-enums",
        obj: {
          ...base,
          FileAs: "TEST-SCRIBE 2 enums",
          Subject: "TEST-SCRIBE 2 enums",
          TypeEn: "2aa21dd4-c3f3-4e87-b34f-1733f7226070",
          StateEn: "2ea5d749-dc1c-4d08-91ee-f7c0e393b415",
          ImportanceEn: "e49ad497-9cff-4fc0-a214-fa7c54a76f2f",
          IsCompleted: false,
        },
      },
      {
        label: "3-project",
        obj: {
          ...base,
          FileAs: "TEST-SCRIBE 3 project",
          Subject: "TEST-SCRIBE 3 project",
          TypeEn: "2aa21dd4-c3f3-4e87-b34f-1733f7226070",
          StateEn: "2ea5d749-dc1c-4d08-91ee-f7c0e393b415",
          ImportanceEn: "e49ad497-9cff-4fc0-a214-fa7c54a76f2f",
          IsCompleted: false,
          Projects_TaskParentGuid: PROJECT,
          Projects_TopLevelProjectGuid: PROJECT,
        },
      },
      {
        label: "4-dates",
        obj: {
          ...base,
          FileAs: "TEST-SCRIBE 4 dates",
          Subject: "TEST-SCRIBE 4 dates",
          Body: "TEST-SCRIBE body",
          TypeEn: "2aa21dd4-c3f3-4e87-b34f-1733f7226070",
          StateEn: "2ea5d749-dc1c-4d08-91ee-f7c0e393b415",
          ImportanceEn: "e49ad497-9cff-4fc0-a214-fa7c54a76f2f",
          IsCompleted: false,
          Projects_TaskParentGuid: PROJECT,
          Projects_TopLevelProjectGuid: PROJECT,
          StartDate: "2026-08-28T00:00:00",
          DueDate: "2026-09-04T00:00:00",
        },
      },
    ];

    const results = [];
    for (const v of variants) {
      const res = await ewayCall(session, "SaveTask", {
        transmitObject: v.obj,
        dieOnItemConflict: false,
      });
      results.push({
        variant: v.label,
        ok: res.ok,
        returnCode: res.returnCode,
        description: res.description,
        raw: res.raw,
      });
      if (!res.ok) break; // the first refusal names the culprit group
    }
    return NextResponse.json({ results });
  }

  // If ?defs=journal is given, return the additional-field definitions that
  // belong to the Journal object type (af_NN are numbered per object type), so
  // we can map the journal's Forma / Typ kontaktu / SOR / Oblast dotazu / Cílová
  // skupina to the right column + enum.
  if (new URL(request.url).searchParams.get("defs") === "journal") {
    const af = await ewayCall(session, "GetAdditionalFields", {});
    const fields = (Array.isArray(af.data) ? (af.data as Record<string, unknown>[]) : [])
      .filter((f) => String(f.ObjectTypeFolderName ?? "").toLowerCase().includes("journal"))
      .map((f) => ({
        ColumnName: f.ColumnName,
        Name: f.Name,
        Type: f.Type,
        AssociatedEnumTypeGuid: f.AssociatedEnumTypeGuid,
      }));
    return NextResponse.json({ journalFields: fields });
  }

  // If ?contact=<name> is given, list EVERY matching contact with its Title
  // (job title) and whether our client filter would keep it — so we can see why
  // non-clients still show up.
  const contactQuery = new URL(request.url).searchParams.get("contact");
  if (contactQuery) {
    const got = await ewayCall(session, "GetContacts", {});
    const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    const q = fold(contactQuery.trim());
    const matches = (Array.isArray(got.data) ? (got.data as Record<string, unknown>[]) : [])
      .filter((c) => fold(String(c.FileAs ?? "")).includes(q))
      .map((c) => {
        const title = typeof c.Title === "string" ? c.Title : null;
        return {
          name: c.FileAs,
          title,
          isClient: !!title && fold(title).includes("klient"),
        };
      });
    return NextResponse.json({ contactQuery, count: matches.length, matches });
  }

  // Pull a small sample of real journals to reveal the exact field codes,
  // and the field/enum definitions so we can map the custom dropdowns.
  const journals = await ewayCall(session, "GetJournals", {});
  const sample =
    journals.ok && Array.isArray(journals.data)
      ? (journals.data as unknown[]).slice(0, 2)
      : journals.data;

  const extras = Object.assign(
    {},
    await safe("additionalFields", () => ewayCall(session, "GetAdditionalFields", {})),
    await safe("enumTypes", () => ewayCall(session, "GetEnumTypes", {}))
  );

  return NextResponse.json({
    ok: true,
    login: { returnCode: login.returnCode },
    getJournals: {
      ok: journals.ok,
      returnCode: journals.returnCode,
      description: journals.description,
      count: Array.isArray(journals.data) ? journals.data.length : null,
    },
    sampleJournals: sample,
    ...extras,
  });
}
