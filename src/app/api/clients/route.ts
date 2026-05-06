import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeClientName } from "@/lib/clients";
import { logAudit } from "@/lib/audit";

// GET /api/clients
// Workers: clients they've recorded with or created.
// Managers: every client across the org. Each client carries per-client
// aggregates from every worker's recordings combined: visit count, last
// visit, total Gemini-extracted action items, and the distinct worker count.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("is_manager")
    .eq("id", user.id)
    .single();
  const isManager = !!profile?.is_manager;

  type ClientInfo = { id: string; name: string; address: string | null };
  type ClientAgg = ClientInfo & {
    visits: number;
    last_visit: string | null;
    action_count: number;
    worker_count: number;
  };

  const byClient = new Map<string, ClientAgg>();

  // Seed: clients the user owns (workers) or every client (managers).
  const seedQuery = admin.from("clients").select("id, name, address");
  const { data: seedClients, error: seedErr } = isManager
    ? await seedQuery
    : await seedQuery.eq("created_by", user.id);

  if (seedErr) {
    return NextResponse.json({ error: seedErr.message }, { status: 500 });
  }

  for (const c of (seedClients || []) as ClientInfo[]) {
    byClient.set(c.id, { ...c, visits: 0, last_visit: null, action_count: 0, worker_count: 0 });
  }

  // Recordings to aggregate over. Workers see only their own; managers see all.
  const recQuery = admin
    .from("recordings")
    .select("user_id, recorded_at, analysis, clients!inner(id, name, address)")
    .not("client_id", "is", null);
  const { data: recs, error: recErr } = isManager
    ? await recQuery
    : await recQuery.eq("user_id", user.id);

  if (recErr) {
    return NextResponse.json({ error: recErr.message }, { status: 500 });
  }

  type RecRow = {
    user_id: string;
    recorded_at: string;
    analysis: { actionItems?: string[] } | null;
    clients: ClientInfo;
  };

  // Track distinct workers per client without storing every user_id.
  const workersPerClient = new Map<string, Set<string>>();

  for (const r of (recs || []) as unknown as RecRow[]) {
    const c = r.clients;
    if (!c) continue;
    let entry = byClient.get(c.id);
    if (!entry) {
      entry = { ...c, visits: 0, last_visit: null, action_count: 0, worker_count: 0 };
      byClient.set(c.id, entry);
    }
    entry.visits += 1;
    if (!entry.last_visit || r.recorded_at > entry.last_visit) {
      entry.last_visit = r.recorded_at;
    }
    if (r.analysis?.actionItems) entry.action_count += r.analysis.actionItems.length;

    let workers = workersPerClient.get(c.id);
    if (!workers) {
      workers = new Set();
      workersPerClient.set(c.id, workers);
    }
    workers.add(r.user_id);
  }

  for (const [id, workers] of workersPerClient) {
    const entry = byClient.get(id);
    if (entry) entry.worker_count = workers.size;
  }

  const clients = Array.from(byClient.values()).sort((a, b) => {
    if (a.last_visit && b.last_visit) return a.last_visit < b.last_visit ? 1 : -1;
    if (a.last_visit) return -1;
    if (b.last_visit) return 1;
    return a.name.localeCompare(b.name);
  });
  return NextResponse.json({ clients, scope: isManager ? "org" : "self" });
}

// POST /api/clients (unchanged behavior — see git history for context)
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

  await logAudit({
    actorId: user.id,
    action: "create_client",
    targetType: "client",
    targetId: created.id,
    targetLabel: created.name,
  });

  return NextResponse.json({ client: created, existed: false });
}
