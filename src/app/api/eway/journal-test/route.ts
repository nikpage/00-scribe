import { NextResponse } from "next/server";
import { getEwaySessionForCurrentUser } from "@/lib/eway/session";
import { saveJournal, searchContacts } from "@/lib/eway/journal";
import { ewayCall } from "@/lib/eway/client";

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
  const contacts = await searchContacts(sess.session, q);
  if (contacts.length === 0) {
    return NextResponse.json({ error: "No eWay contacts found to attach to" }, { status: 404 });
  }
  const contact = contacts[0];

  const now = new Date();
  const result = await saveJournal(sess.session, {
    contactGuid: contact.guid,
    contactName: contact.name,
    note: `SCRIBE TEST — delete me. Created ${now.toISOString()}`,
    eventStart: now.toISOString(),
    eventEnd: now.toISOString(),
  });

  // Read the created record back, including relations, and keep only the
  // populated columns.
  let populated: Record<string, unknown> | null = null;
  if (result.journalGuid) {
    const got = await ewayCall(sess.session, "GetJournalsByItemGuids", {
      itemGuids: [result.journalGuid],
      includeForeignKeys: true,
      includeRelations: true,
    });
    const rec = Array.isArray(got.data) ? (got.data[0] as Record<string, unknown>) : null;
    if (rec) {
      populated = {};
      for (const [k, v] of Object.entries(rec)) {
        if (v !== null && v !== "" && !(Array.isArray(v) && v.length === 0)) populated[k] = v;
      }
    }
  }

  return NextResponse.json({ usedContact: contact, result, populated });
}
