import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/clients
// Returns clients the authenticated worker has recorded with, plus per-client
// aggregates: visit count, last visit date, total Gemini-extracted action items.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("recordings")
    .select("recorded_at, analysis, clients!inner(id, name, address)")
    .eq("user_id", user.id)
    .not("client_id", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type Row = {
    recorded_at: string;
    analysis: { actionItems?: string[] } | null;
    clients: { id: string; name: string; address: string | null };
  };
  type ClientAgg = {
    id: string;
    name: string;
    address: string | null;
    visits: number;
    last_visit: string;
    action_count: number;
  };

  const byClient = new Map<string, ClientAgg>();
  for (const r of (data || []) as unknown as Row[]) {
    const c = r.clients;
    if (!c) continue;
    let entry = byClient.get(c.id);
    if (!entry) {
      entry = { id: c.id, name: c.name, address: c.address, visits: 0, last_visit: r.recorded_at, action_count: 0 };
      byClient.set(c.id, entry);
    }
    entry.visits += 1;
    if (r.recorded_at > entry.last_visit) entry.last_visit = r.recorded_at;
    if (r.analysis?.actionItems) entry.action_count += r.analysis.actionItems.length;
  }

  const clients = Array.from(byClient.values()).sort((a, b) =>
    a.last_visit < b.last_visit ? 1 : -1
  );
  return NextResponse.json({ clients });
}
