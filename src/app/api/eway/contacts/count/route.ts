import { NextResponse } from "next/server";
import { getEwaySessionForCurrentUser } from "@/lib/eway/session";
import { getClients } from "@/lib/eway/journal";

export const dynamic = "force-dynamic";

export async function GET() {
  const sess = await getEwaySessionForCurrentUser();
  if (!sess.ok) return NextResponse.json({ error: sess.error }, { status: sess.status });
  const clients = await getClients(sess.session);
  return NextResponse.json({ count: clients.length }, { headers: { "Cache-Control": "no-store" } });
}
