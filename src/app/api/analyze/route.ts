import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { analyzeTranscript } from "@/lib/analysis/gemini";
import { computeMetrics } from "@/lib/analysis/metrics";

// POST — run AI analysis on an existing transcript
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { recordingId } = await request.json();
  if (!recordingId) {
    return NextResponse.json({ error: "Missing recordingId" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: recording } = await admin
    .from("recordings")
    .select("*")
    .eq("id", recordingId)
    .single();

  if (!recording) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  if (!recording.transcript?.utterances?.length) {
    return NextResponse.json({ error: "No transcript available" }, { status: 400 });
  }

  const utterances = recording.transcript.utterances;
  const speakers = recording.speakers || {};

  // Compute metrics
  const metrics = computeMetrics(utterances, recording.duration_seconds);

  // Run AI analysis
  let analysis = null;
  try {
    analysis = await analyzeTranscript(utterances, speakers);
  } catch (err) {
    console.error("AI analysis failed:", err);
    return NextResponse.json({ error: "AI analysis failed" }, { status: 500 });
  }

  await admin
    .from("recordings")
    .update({ metrics, analysis, updated_at: new Date().toISOString() })
    .eq("id", recordingId);

  return NextResponse.json({ metrics, analysis });
}
