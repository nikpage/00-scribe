import { NextResponse } from "next/server";
import { getEwaySessionForCurrentUser, callEwayWithSessionRetry } from "@/lib/eway/session";
import { getContacts, filterContacts } from "@/lib/eway/journal";
import { getCachedPeople } from "@/lib/eway/people-cache";

// GET /api/eway/contacts?q=<name> — search the worker's eWay contacts by name.
//
// eWay is slow, so we pull the full contact list once per worker and cache it for
// a few minutes; each keystroke filters that cached list locally instead of
// hitting eWay again.

export async function GET(request: Request) {
  const sess = await getEwaySessionForCurrentUser();
  if (!sess.ok) return NextResponse.json({ error: sess.error }, { status: sess.status });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const refresh = searchParams.get("refresh") === "1";

  try {
    const contacts = await getCachedPeople("contacts", sess.userId, refresh, () =>
      callEwayWithSessionRetry(sess, (session) => getContacts(session))
    );
    return NextResponse.json(
      { contacts: filterContacts(contacts, q), total: contacts.length },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Contact search failed" },
      { status: 502 }
    );
  }
}
