import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";

// GET /api/manager/needs-review
// Returns recordings flagged for manager triage. A recording surfaces here if:
//   - status = 'failed'                                 (transcription/upload broke)
//   - analysis.qualityScore <= 2                        (low rated interview)
//   - any speaker has a talk_ratio outside [0.30, 0.70] (worker dominated or
//     barely spoke, often a coaching signal)
// Each row carries a reason so the UI can show why it was flagged.
export async function GET() {
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

  type Row = {
    id: string;
    user_id: string;
    label: string;
    recorded_at: string;
    duration_seconds: number | null;
    status: string;
    error: string | null;
    kind: "interview" | "worker_notes";
    parent_recording_id: string | null;
    analysis: { qualityScore?: number; summary?: string } | null;
    metrics: {
      speakerMetrics?: Record<string, { talkRatio: number }>;
    } | null;
    profiles: { name: string } | null;
  };

  const { data, error } = await admin
    .from("recordings")
    .select(
      "id, user_id, label, recorded_at, duration_seconds, status, error, kind, parent_recording_id, analysis, metrics, profiles(name)"
    )
    .eq("archived", false)
    .order("recorded_at", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const flagged = [];
  for (const r of (data || []) as unknown as Row[]) {
    const reasons: string[] = [];
    if (r.status === "failed") reasons.push("failed");
    // Quality + talk-ratio signals only apply to interviews; notes are a
    // single-speaker monologue, so those checks would be noise.
    if (r.kind !== "worker_notes") {
      if (r.analysis && typeof r.analysis.qualityScore === "number" && r.analysis.qualityScore <= 2) {
        reasons.push("low_quality");
      }
      const ratios = Object.values(r.metrics?.speakerMetrics || {}).map((s) => s.talkRatio);
      if (ratios.some((v) => v > 0.7 || v < 0.3) && ratios.length >= 2) {
        reasons.push("talk_ratio");
      }
    }
    if (reasons.length === 0) continue;
    flagged.push({
      id: r.id,
      worker_id: r.user_id,
      worker_name: r.profiles?.name || "",
      label: r.label,
      recorded_at: r.recorded_at,
      duration_seconds: r.duration_seconds,
      status: r.status,
      error: r.error,
      kind: r.kind,
      parent_recording_id: r.parent_recording_id,
      quality_score: r.analysis?.qualityScore ?? null,
      summary: r.analysis?.summary ?? null,
      reasons,
    });
  }

  await logAudit({
    actorId: user.id,
    action: "view_needs_review",
    targetType: "system",
    metadata: { count: flagged.length },
  });

  return NextResponse.json({ recordings: flagged });
}
