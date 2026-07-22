import { NextResponse } from "next/server";
import { getEwaySessionForCurrentUser, callEwayWithSessionRetry } from "@/lib/eway/session";
import { saveJournal, searchContacts } from "@/lib/eway/journal";
import { summarizeBrief } from "@/lib/analysis/gemini";
import { ewayCall } from "@/lib/eway/client";

// Never cache: each call must actually write + read a fresh record.
export const dynamic = "force-dynamic";

// GET /api/eway/journal-test?contact=<name> — write ONE real journal using the
// actual save logic, then read it straight back. Picks the first matching eWay
// contact (or the first contact at all) so it attaches to a real person.
// Returns the save result plus the created record's populated columns so we can
// see exactly which fields (Type, dropdowns, Contact Person, Superior Item)
// landed. Throwaway diagnostics.
export async function GET(request: Request) {
  const sess = await getEwaySessionForCurrentUser();
  if (!sess.ok) return NextResponse.json({ error: sess.error }, { status: sess.status });

  const q = new URL(request.url).searchParams.get("contact") ?? "";
  const contacts = await callEwayWithSessionRetry(sess, (session) => searchContacts(session, q));
  if (contacts.length === 0) {
    return NextResponse.json({ error: "No eWay contacts found to attach to" }, { status: 404 });
  }
  const contact = contacts[0];

  const now = new Date();
  const testNote =
    "Klient přišel na schůzku, řešili jsme bydlení a dávky. Domluven další kontakt. (SCRIBE TEST — delete me)";

  // Probe the AI summary directly so we see whether it works or why it fails,
  // instead of it silently falling back to just the name inside saveJournal.
  let summaryProbe: { ok: boolean; summary?: string; error?: string };
  try {
    summaryProbe = { ok: true, summary: await summarizeBrief(testNote) };
  } catch (err) {
    summaryProbe = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  const geminiKeyPresent = !!process.env.GEMINI_API_KEY;

  // No explicit subject -> exercises the real "<last name>: <AI summary>" path.
  const result = await callEwayWithSessionRetry(sess, (session) =>
    saveJournal(session, {
      contactGuid: contact.guid,
      contactName: contact.name,
      note: testNote,
      eventStart: now.toISOString(),
      eventEnd: now.toISOString(),
    })
  );

  // Read the created record back, including relations, and keep only the
  // populated columns.
  let populated: Record<string, unknown> | null = null;
  if (result.journalGuid) {
    const got = await callEwayWithSessionRetry(sess, (session) =>
      ewayCall(session, "GetJournalsByItemGuids", {
        itemGuids: [result.journalGuid],
        includeForeignKeys: true,
        includeRelations: true,
      })
    );
    const rec = Array.isArray(got.data) ? (got.data[0] as Record<string, unknown>) : null;
    if (rec) {
      populated = {};
      for (const [k, v] of Object.entries(rec)) {
        if (v !== null && v !== "" && !(Array.isArray(v) && v.length === 0)) populated[k] = v;
      }
    }
  }

  return NextResponse.json(
    { usedContact: contact, geminiKeyPresent, summaryProbe, result, populated },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
