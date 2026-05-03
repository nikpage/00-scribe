import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeClientName } from "@/lib/clients";

// GET /api/clients
// Returns every client the authenticated worker has either recorded with or
// created themselves, plus per-client aggregates from their own recordings:
// visit count, last visit date, total Gemini-extracted action items.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Clients this worker created (may have zero recordings).
  const { data: ownClients, error: ownErr } = await admin
    .from("clients")
    .select("id, name, address")
    .eq("created_by", user.id);

  if (ownErr) {
    return NextResponse.json({ error: ownErr.message }, { status: 500 });
  }

  // Recordings by this worker, joined to client info, for aggregates.
  const { data: recs, error: recErr } = await admin
    .from("recordings")
    .select("recorded_at, analysis, clients!inner(id, name, address)")
    .eq("user_id", user.id)
    .not("client_id", "is", null);

  if (recErr) {
    return NextResponse.json({ error: recErr.message }, { status: 500 });
  }

  type ClientInfo = { id: string; name: string; address: string | null };
  type RecRow = {
    recorded_at: string;
    analysis: { actionItems?: string[] } | null;
    clients: ClientInfo;
  };
  type ClientAgg = ClientInfo & {
    visits: number;
    last_visit: string | null;
    action_count: number;
  };

  const byClient = new Map<string, ClientAgg>();
  for (const c of (ownClients || []) as ClientInfo[]) {
    byClient.set(c.id, { ...c, visits: 0, last_visit: null, action_count: 0 });
  }
  for (const r of (recs || []) as unknown as RecRow[]) {
    const c = r.clients;
    if (!c) continue;
    let entry = byClient.get(c.id);
    if (!entry) {
      entry = { ...c, visits: 0, last_visit: null, action_count: 0 };
      byClient.set(c.id, entry);
    }
    entry.visits += 1;
    if (!entry.last_visit || r.recorded_at > entry.last_visit) {
      entry.last_visit = r.recorded_at;
    }
    if (r.analysis?.actionItems) entry.action_count += r.analysis.actionItems.length;
  }

  // Sort by last_visit desc; clients with no visits go last by name.
  const clients = Array.from(byClient.values()).sort((a, b) => {
    if (a.last_visit && b.last_visit) return a.last_visit < b.last_visit ? 1 : -1;
    if (a.last_visit) return -1;
    if (b.last_visit) return 1;
    return a.name.localeCompare(b.name);
  });
  return NextResponse.json({ clients });
}

// POST /api/clients
// Creates a client (name + optional address). If a client with the same
// normalized name and address already exists, returns that one instead.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const address = typeof body.address === "string" && body.address.trim() ? body.address.trim() : null;

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const normalized = normalizeClientName(name);

  const lookup = admin.from("clients").select("id, name, address").eq("normalized", normalized);
  const { data: existing } = await (
    address ? lookup.ilike("address", address) : lookup.is("address", null)
  ).maybeSingle();

  if (existing) {
    return NextResponse.json({ client: existing, existed: true });
  }

  const { data: created, error } = await admin
    .from("clients")
    .insert({ name, address, created_by: user.id })
    .select("id, name, address")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ client: created, existed: false });
}
