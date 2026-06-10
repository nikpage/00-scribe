import { NextResponse } from "next/server";
import { getEwaySessionForCurrentUser } from "@/lib/eway/session";
import { getClients, filterClients, type ContactOption } from "@/lib/eway/journal";

// GET /api/eway/contacts?q=<name> — search the worker's eWay clients by name.
//
// eWay is slow, so we pull the full client list once per worker and cache it for
// a few minutes; each keystroke filters that cached list locally instead of
// hitting eWay again.
const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { clients: ContactOption[]; expires: number }>();

export async function GET(request: Request) {
  const sess = await getEwaySessionForCurrentUser();
  if (!sess.ok) return NextResponse.json({ error: sess.error }, { status: sess.status });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const refresh = searchParams.get("refresh") === "1";

  try {
    let entry = cache.get(sess.userId);
    if (refresh || !entry || entry.expires < Date.now()) {
      entry = { clients: await getClients(sess.session), expires: Date.now() + TTL_MS };
      cache.set(sess.userId, entry);
    }
    return NextResponse.json(
      { contacts: filterClients(entry.clients, q), total: entry.clients.length },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Contact search failed" },
      { status: 502 }
    );
  }
}
