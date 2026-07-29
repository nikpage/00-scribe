import { NextResponse } from "next/server";
import { getEwaySessionForCurrentUser, callEwayWithSessionRetry } from "@/lib/eway/session";
import { getContacts } from "@/lib/eway/journal";

export const dynamic = "force-dynamic";

export async function GET() {
  const sess = await getEwaySessionForCurrentUser();
  if (!sess.ok) return NextResponse.json({ error: sess.error }, { status: sess.status });
  try {
    const contacts = await callEwayWithSessionRetry(sess, (session) => getContacts(session));
    return NextResponse.json({ count: contacts.length }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Contact count failed" },
      { status: 502 }
    );
  }
}
