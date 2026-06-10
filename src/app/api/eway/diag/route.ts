import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/eway/crypto";
import { ewayLogin, ewayCall } from "@/lib/eway/client";

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
    const got = await ewayCall(session, "GetJournalsByItemGuids", { itemGuids: [journalGuid] });
    const rec = Array.isArray(got.data) ? (got.data[0] as Record<string, unknown>) : null;
    const populated: Record<string, unknown> = {};
    if (rec) {
      for (const [k, v] of Object.entries(rec)) {
        if (v !== null && v !== "" && !(Array.isArray(v) && v.length === 0)) populated[k] = v;
      }
    }
    return NextResponse.json({ journalGuid, returnCode: got.returnCode, populated });
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
