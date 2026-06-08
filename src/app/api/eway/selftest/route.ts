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
    loggedIn: true,
    inserted: save.ok,
    insertedGuid: guid,
    confirmedPresent:
      readBack !== null &&
      typeof readBack === "object" &&
      (readBack as { ok?: boolean }).ok === true,
    raw: { save, readBack },
  });
}
