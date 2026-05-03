import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/clients/[id]
// Returns a client and the worker's own recordings with that client.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: client, error: clientErr } = await admin
    .from("clients")
    .select("id, name, address, created_at")
    .eq("id", id)
    .single();

  if (clientErr || !client) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: recordings, error: recErr } = await admin
    .from("recordings")
    .select("id, label, recorded_at, duration_seconds, status, analysis")
    .eq("client_id", id)
    .eq("user_id", user.id)
    .order("recorded_at", { ascending: false });

  if (recErr) {
    return NextResponse.json({ error: recErr.message }, { status: 500 });
  }

  if (!recordings || recordings.length === 0) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ client, recordings });
}
