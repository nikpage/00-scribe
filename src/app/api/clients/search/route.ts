import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeClientName } from "@/lib/clients";

// GET /api/clients/search?q=<query>
// Returns up to 10 client suggestions matching the (normalized) query.
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  if (!q) {
    return NextResponse.json({ clients: [] });
  }

  const normalized = normalizeClientName(q);
  const admin = createAdminClient();

  // Restrict suggestions to clients the worker has previously recorded with.
  // Managers will get a separate cross-worker view later.
  const { data: ownClients, error } = await admin
    .from("recordings")
    .select("clients!inner(id, name, address, normalized)")
    .eq("user_id", user.id)
    .not("client_id", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type ClientRow = { id: string; name: string; address: string | null; normalized: string };
  const seen = new Set<string>();
  const matches: ClientRow[] = [];
  for (const row of (ownClients || []) as unknown as { clients: ClientRow }[]) {
    const c = row.clients;
    if (!c || seen.has(c.id)) continue;
    if (c.normalized.includes(normalized) || normalized.includes(c.normalized)) {
      seen.add(c.id);
      matches.push(c);
      if (matches.length >= 10) break;
    }
  }

  return NextResponse.json({ clients: matches });
}
