import { NextResponse } from "next/server";
import { getEwaySessionForCurrentUser, callEwayWithSessionRetry } from "@/lib/eway/session";
import {
  getContacts,
  getUsers,
  mergePeople,
  filterContacts,
  type ContactOption,
} from "@/lib/eway/journal";

// GET /api/eway/contacts?q=<name> — search the worker's eWay people by name:
// both Contacts (clients) and Users (colleagues), in one merged list. Each
// entry carries a `type` flag saying which module it came from.
//
// eWay is slow, so we pull both full lists once per worker and cache them for
// a few minutes; each keystroke filters that cached list locally instead of
// hitting eWay again.
const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { contacts: ContactOption[]; expires: number }>();

export async function GET(request: Request) {
  const sess = await getEwaySessionForCurrentUser();
  if (!sess.ok) return NextResponse.json({ error: sess.error }, { status: sess.status });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const refresh = searchParams.get("refresh") === "1";

  try {
    let entry = cache.get(sess.userId);
    if (refresh || !entry || entry.expires < Date.now()) {
      const [contacts, users] = await callEwayWithSessionRetry(sess, (session) =>
        Promise.all([getContacts(session), getUsers(session)])
      );
      entry = { contacts: mergePeople(contacts, users), expires: Date.now() + TTL_MS };
      cache.set(sess.userId, entry);
    }
    return NextResponse.json(
      { contacts: filterContacts(entry.contacts, q), total: entry.contacts.length },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Person search failed" },
      { status: 502 }
    );
  }
}
