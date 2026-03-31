import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
  const { id, label, filename, recorded_at, duration_seconds, file_size_bytes, speakers_expected, language } = body;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("recordings")
    .insert({
      id,
      user_id: user.id,
      label,
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

  const { recordingId, status, error: errorMsg } = await request.json();

  if (!recordingId || !status) {
    return NextResponse.json({ error: "Missing recordingId or status" }, { status: 400 });
  }

  const admin = createAdminClient();

  const updateData: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (errorMsg !== undefined) {
    updateData.error = errorMsg;
  }

  const { error } = await admin
    .from("recordings")
    .update(updateData)
    .eq("id", recordingId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
