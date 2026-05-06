import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";

// GET /api/manager/audit-log?limit=200
// Manager-only. Returns recent audit events, newest first. Logs the read
// itself (managers viewing the log are themselves audited).
export async function GET(request: Request) {
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
  if (!profile?.is_manager) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const limitParam = parseInt(url.searchParams.get("limit") || "200", 10);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 1000) : 200;

  const { data, error } = await admin
    .from("audit_log")
    .select("id, actor_id, action, target_type, target_id, target_label, metadata, created_at, profiles(name)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type Row = {
    id: string;
    actor_id: string | null;
    action: string;
    target_type: string;
    target_id: string | null;
    target_label: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
    profiles: { name: string } | null;
  };

  const events = ((data || []) as unknown as Row[]).map((r) => ({
    id: r.id,
    actor_id: r.actor_id,
    actor_name: r.profiles?.name ?? null,
    action: r.action,
    target_type: r.target_type,
    target_id: r.target_id,
    target_label: r.target_label,
    metadata: r.metadata,
    created_at: r.created_at,
  }));

  await logAudit({
    actorId: user.id,
    action: "view_audit_log",
    targetType: "system",
    metadata: { limit },
  });

  return NextResponse.json({ events });
}
