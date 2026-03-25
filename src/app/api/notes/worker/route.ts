import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function getManagerUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("is_manager")
    .eq("id", user.id)
    .single();

  if (!profile?.is_manager) return null;
  return { user, admin };
}

// GET — list notes for a worker
export async function GET(request: Request) {
  const ctx = await getManagerUser();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const workerId = searchParams.get("workerId");
  if (!workerId) {
    return NextResponse.json({ error: "Missing workerId" }, { status: 400 });
  }

  const { data, error } = await ctx.admin
    .from("worker_notes")
    .select("*, author:profiles!author_id(name)")
    .eq("worker_id", workerId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ notes: data || [] });
}

// POST — create a note on a worker
export async function POST(request: Request) {
  const ctx = await getManagerUser();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workerId, content } = await request.json();
  if (!workerId || !content?.trim()) {
    return NextResponse.json({ error: "Missing workerId or content" }, { status: 400 });
  }

  const { data, error } = await ctx.admin
    .from("worker_notes")
    .insert({
      worker_id: workerId,
      author_id: ctx.user.id,
      content: content.trim(),
    })
    .select("*, author:profiles!author_id(name)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ note: data });
}

// DELETE — delete a note
export async function DELETE(request: Request) {
  const ctx = await getManagerUser();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { noteId } = await request.json();
  if (!noteId) {
    return NextResponse.json({ error: "Missing noteId" }, { status: 400 });
  }

  const { error } = await ctx.admin
    .from("worker_notes")
    .delete()
    .eq("id", noteId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
