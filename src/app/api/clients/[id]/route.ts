import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/clients/[id]
// Returns a client and that client's recordings.
// Workers: only their own recordings.
// Managers: every recording, with the worker's name attached.
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

  const { data: profile } = await admin
    .from("profiles")
    .select("is_manager")
    .eq("id", user.id)
    .single();
  const isManager = !!profile?.is_manager;

  const { data: client, error: clientErr } = await admin
    .from("clients")
    .select("id, name, address, created_by, created_at")
    .eq("id", id)
    .single();

  if (clientErr || !client) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const recQuery = admin
    .from("recordings")
    .select(
      isManager
        ? "id, user_id, label, recorded_at, duration_seconds, status, analysis, profiles(name)"
        : "id, user_id, label, recorded_at, duration_seconds, status, analysis"
    )
    .eq("client_id", id)
    .order("recorded_at", { ascending: false });

  const { data: recordings, error: recErr } = isManager
    ? await recQuery
    : await recQuery.eq("user_id", user.id);

  if (recErr) {
    return NextResponse.json({ error: recErr.message }, { status: 500 });
  }

  const hasAccess =
    isManager || client.created_by === user.id || (recordings && recordings.length > 0);
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    client,
    recordings: recordings || [],
    scope: isManager ? "org" : "self",
  });
}

// PATCH /api/clients/[id] (unchanged — see git history)
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

  const { data: profile } = await admin
    .from("profiles")
    .select("is_manager")
    .eq("id", user.id)
    .single();
  const canEdit = profile?.is_manager || existing.created_by === user.id;
  if (!canEdit) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: updated, error } = await admin
    .from("clients")
    .update(updates)
    .eq("id", id)
    .select("id, name, address")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  return NextResponse.json({ client: updated });
}
