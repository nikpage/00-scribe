import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/clients/[id]
// Returns a client and the worker's own recordings with that client.
// Access: workers who created the client or have recorded with them.
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
    .select("id, name, address, created_by, created_at")
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

  const hasAccess = client.created_by === user.id || (recordings && recordings.length > 0);
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ client, recordings: recordings || [] });
}

// PATCH /api/clients/[id]
// Update name and/or address. Workers can only edit clients they created.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const updates: { name?: string; address?: string | null } = {};
  if (typeof body.name === "string") {
    const trimmed = body.name.trim();
    if (!trimmed) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    updates.name = trimmed;
  }
  if ("address" in body) {
    const v = body.address;
    updates.address = typeof v === "string" && v.trim() ? v.trim() : null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: existing, error: fetchErr } = await admin
    .from("clients")
    .select("id, created_by")
    .eq("id", id)
    .single();

  if (fetchErr || !existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.created_by !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: updated, error } = await admin
    .from("clients")
    .update(updates)
    .eq("id", id)
    .select("id, name, address")
    .single();

  if (error) {
    // Most likely a unique-index conflict (same normalized name + address).
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  return NextResponse.json({ client: updated });
}
