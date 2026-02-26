import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id, label, filename, recorded_at, duration_seconds, file_size_bytes } = body;

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
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ recording: data });
}
