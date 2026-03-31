import { createClient } from "@supabase/supabase-js";
import { analyzeTranscript } from "@/lib/analysis/gemini";
import { computeMetrics } from "@/lib/analysis/metrics";
import type { TranscriptionResult } from "./types";

export function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function formatTranscriptText(
  utterances: { speaker: string; text: string }[],
  speakers: Record<string, string>
): string {
  return utterances
    .map((u) => {
      const name = speakers[u.speaker] || `Speaker ${u.speaker}`;
      return `${name}: ${u.text}`;
    })
    .join("\n\n");
}

/**
 * Shared logic for processing a completed transcription result.
 * Used by both AssemblyAI and Speechmatics webhook handlers.
 */
export async function processTranscriptionResult(
  result: TranscriptionResult,
  transcriptionId: string
) {
  const admin = getAdminClient();

  // Find the recording by transcription ID
  const { data: recording } = await admin
    .from("recordings")
    .select("*")
    .eq("transcription_id", transcriptionId)
    .single();

  if (!recording) {
    return { found: false as const };
  }

  if (result.status === "error") {
    await admin
      .from("recordings")
      .update({
        status: "failed",
        error: result.error,
        updated_at: new Date().toISOString(),
      })
      .eq("id", recording.id);

    return { found: true as const, status: "error" as const };
  }

  // Save transcript to DB
  const transcript = { utterances: result.utterances };
  const speakers = recording.speakers || {};

  // Save .txt to Supabase Storage
  const text = formatTranscriptText(result.utterances, speakers);
  const textPath = `${recording.user_id}/${recording.filename}.txt`;

  await admin.storage.createBucket("recordings", { public: false }).catch(() => {});
  await admin.storage
    .from("recordings")
    .upload(textPath, Buffer.from(text), {
      contentType: "text/plain",
      upsert: true,
    });

  // Compute metrics from transcript
  const metrics = computeMetrics(result.utterances, recording.duration_seconds);

  // Run AI analysis (non-blocking — update DB when ready)
  let analysis = null;
  try {
    if (process.env.GEMINI_API_KEY) {
      analysis = await analyzeTranscript(result.utterances, speakers);
    }
  } catch (err) {
    console.error("AI analysis failed (non-fatal):", err);
  }

  // Update recording
  await admin
    .from("recordings")
    .update({
      status: "done",
      transcript,
      metrics,
      analysis,
      drive_text_id: textPath,
      updated_at: new Date().toISOString(),
    })
    .eq("id", recording.id);

  return { found: true as const, status: "ok" as const };
}
