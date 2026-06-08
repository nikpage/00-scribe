import { NextResponse } from "next/server";
import { getEwaySessionForCurrentUser } from "@/lib/eway/session";
import { searchContacts } from "@/lib/eway/journal";

// GET /api/eway/contacts?q=<name> — search the worker's eWay contacts by name
// so the journal screen can offer a "type a name, pick the right one" picker.
export async function GET(request: Request) {
  const sess = await getEwaySessionForCurrentUser();
  if (!sess.ok) return NextResponse.json({ error: sess.error }, { status: sess.status });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";

  try {
    const contacts = await searchContacts(sess.session, q);
    return NextResponse.json({ contacts });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Contact search failed" },
      { status: 502 }
    );
  }
}
