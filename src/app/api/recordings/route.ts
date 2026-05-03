import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeClientName } from "@/lib/clients";

// GET — list recordings for the authenticated user (admin client bypasses RLS)
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
    .select("*")
    .eq("user_id", user.id)
    .eq("archived", false)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ recordings: data || [] });
}

// POST — create a new recording row
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id, label, address, filename, recorded_at, duration_seconds, file_size_bytes, speakers_expected, language } = body;

  const admin = createAdminClient();

  // Resolve or create the client by (normalized name, address).
  let clientId: string | null = null;
  if (label && label.trim()) {
    const normalized = normalizeClientName(label);
    const addr = address?.trim() || null;
    const lookup = admin.from("clients").select("id").eq("normalized", normalized);
    const { data: existing } = await (
      addr ? lookup.ilike("address", addr) : lookup.is("address", null)
    ).maybeSingle();

    if (existing) {
      clientId = existing.id;
    } else {
      const { data: created, error: clientErr } = await admin
        .from("clients")
        .insert({ name: label.trim(), address: addr, created_by: user.id })
        .select("id")
        .single();
      if (clientErr) {
        return NextResponse.json({ error: clientErr.message }, { status: 500 });
      }
      clientId = created.id;
    }
  }

  const { data, error } = await admin
    .from("recordings")
    .insert({
      id,
      user_id: user.id,
      label,
      address: address?.trim() || null,
      client_id: clientId,
      filename,
      recorded_at,
      duration_seconds,
      file_size_bytes,
      status: "pending",
      speakers: { expected: speakers_expected || 2 },
      language: language || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ recording: data });
}

// PUT — update recording status (admin client bypasses RLS)
export async function PUT(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { recordingId, status, error: errorMsg, archived } = await request.json();

  if (!recordingId) {
    return NextResponse.json({ error: "Missing recordingId" }, { status: 400 });
  }

  const admin = createAdminClient();

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (status !== undefined) updateData.status = status;
  if (errorMsg !== undefined) updateData.error = errorMsg;
  if (archived !== undefined) updateData.archived = archived;

  const { error } = await admin
    .from("recordings")
    .update(updateData)
    .eq("id", recordingId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
