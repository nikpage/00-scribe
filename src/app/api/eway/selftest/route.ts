import { NextResponse } from "next/server";
import { ewayLogin, ewayCall } from "@/lib/eway/client";

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

  const login = await ewayLogin(user, pass);
  if (!login.ok || !login.sessionId) {
    return NextResponse.json({ step: "login", login }, { status: 502 });
  }
  const session = login.sessionId;

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

  const guid =
    save.data && typeof save.data === "object"
      ? (save.data as Record<string, unknown>).Guid ?? (save.data as Record<string, unknown>).ItemGUID
      : null;

  // Read it back to confirm it actually landed.
  let readBack: unknown = null;
  if (save.ok && typeof guid === "string") {
    const got = await ewayCall(session, "GetJournalsByItemGuids", { itemGuids: [guid] });
    readBack = got;
  }

  return NextResponse.json({
    loggedIn: login.ok,
    inserted: save.ok,
    insertedGuid: guid,
    confirmedPresent:
      readBack !== null &&
      typeof readBack === "object" &&
      (readBack as { ok?: boolean }).ok === true,
    raw: { save, readBack },
  });
}
