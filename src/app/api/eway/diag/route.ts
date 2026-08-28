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

  // TEMPORARY: ?meetings=1 — discovery for the meeting-minutes feature.
  // Lists the projects whose name looks like the minutes project ("porad"),
  // the active users a task could be assigned to, and the Task object's own
  // additional fields + the enum types behind Task Type/State, so the save
  // path can be built against real GUIDs instead of guesses.
  if (new URL(request.url).searchParams.get("meetings") === "1") {
    const [projects, users, af, tasks] = await Promise.all([
      ewayCall(session, "GetProjects", {}),
      getUsers(session),
      ewayCall(session, "GetAdditionalFields", {}),
      ewayCall(session, "GetTasks", {}),
    ]);

    const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    const allProjects = Array.isArray(projects.data)
      ? (projects.data as Record<string, unknown>[])
      : [];
    const matching = allProjects
      .filter((p) => fold(String(p.ProjectName ?? p.FileAs ?? "")).includes("porad"))
      .map((p) => ({
        guid: p.ItemGUID,
        name: p.ProjectName ?? p.FileAs,
        superior: p.Projects_SuperiorProjectGuid ?? null,
        completed: p.IsCompleted ?? null,
      }));

    const taskFields = (Array.isArray(af.data) ? (af.data as Record<string, unknown>[]) : [])
      .filter((f) => String(f.ObjectTypeFolderName ?? "").toLowerCase().includes("task"))
      .map((f) => ({
        ColumnName: f.ColumnName,
        Name: f.Name,
        Type: f.Type,
        AssociatedEnumTypeGuid: f.AssociatedEnumTypeGuid,
      }));

    // One real task, populated fields only — shows how TypeEn/StateEn/solver
    // are actually filled in this instance.
    const sampleTask = (() => {
      const rec = Array.isArray(tasks.data)
        ? ((tasks.data as Record<string, unknown>[])[0] ?? null)
        : null;
      if (!rec) return null;
      const populated: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rec)) {
        if (v !== null && v !== "" && !(Array.isArray(v) && v.length === 0)) populated[k] = v;
      }
      return populated;
    })();

    return NextResponse.json({
      projects: { total: allProjects.length, matching },
      users: users.map((u) => ({ guid: u.guid, name: u.name, email: u.email })),
      taskAdditionalFields: taskFields,
      taskCount: Array.isArray(tasks.data) ? tasks.data.length : null,
      sampleTask,
    });
  }

  // TEMPORARY: ?meetings=2 — second pass. Reads a handful of recent tasks WITH
  // foreign keys (to see how solver/delegator/project are really filled) and
  // resolves the Task TypeEn/StateEn enum values to their labels, plus lists
  // whatever already sits under the "Zapisy z porad" project.
  const meetings2 = new URL(request.url).searchParams.get("meetings") === "2";
  if (meetings2) {
    const ZAPISY = "f8c3120c-a2af-11f1-a019-8b0d307348be";

    const [tasks, enums, journals] = await Promise.all([
      ewayCall(session, "GetTasks", { includeForeignKeys: true }),
      ewayCall(session, "GetEnumValues", {}),
      ewayCall(session, "GetJournals", { includeForeignKeys: true }),
    ]);

    const taskRows = Array.isArray(tasks.data) ? (tasks.data as Record<string, unknown>[]) : [];
    const recent = [...taskRows]
      .sort((a, b) => String(b.ItemCreated ?? "").localeCompare(String(a.ItemCreated ?? "")))
      .slice(0, 3)
      .map((rec) => {
        const populated: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rec)) {
          if (v !== null && v !== "" && !(Array.isArray(v) && v.length === 0)) populated[k] = v;
        }
        return populated;
      });

    // How often tasks are actually filed under a project at all.
    const withProject = taskRows.filter((t) => t.Projects_TaskParentGuid || t.Projects_TopLevelProjectGuid).length;
    const withSolver = taskRows.filter((t) => t.Users_TaskSolverGuid).length;

    // Resolve the Task Type / State enums: find the value rows for the GUIDs the
    // sample task uses, then list every sibling value of those enum types.
    const enumRows = Array.isArray(enums.data) ? (enums.data as Record<string, unknown>[]) : [];
    const typeOf = (valueGuid: string) => {
      const row = enumRows.find((e) => e.ItemGUID === valueGuid);
      const t = row ? String(row.EnumTypeGuid ?? "") : "";
      return {
        valueGuid,
        label: row?.FileAs ?? row?.En ?? row?.Cz ?? null,
        enumTypeGuid: t || null,
        siblings: t
          ? enumRows
              .filter((e) => e.EnumTypeGuid === t)
              .map((e) => ({ guid: e.ItemGUID, label: e.FileAs ?? e.En ?? e.Cz }))
          : [],
      };
    };

    const journalRows = Array.isArray(journals.data)
      ? (journals.data as Record<string, unknown>[])
      : [];
    const underZapisy = journalRows
      .filter((j) => j.Projects_SuperiorItemGuid === ZAPISY)
      .slice(0, 5)
      .map((j) => ({ guid: j.ItemGUID, fileAs: j.FileAs, created: j.ItemCreated }));

    return NextResponse.json({
      taskTotals: { total: taskRows.length, withProject, withSolver },
      recentTasksWithFKs: recent,
      taskTypeEnum: typeOf("2aa21dd4-c3f3-4e87-b34f-1733f7226070"),
      taskStateEnum: typeOf("0a35bb85-4596-4ad7-befb-0742d8e7cf4a"),
      journalsUnderZapisy: { count: journalRows.filter((j) => j.Projects_SuperiorItemGuid === ZAPISY).length, sample: underZapisy },
    });
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
