import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getProvider } from "@/lib/transcription";
import { analyzeTranscript } from "@/lib/analysis/gemini";
import { computeMetrics } from "@/lib/analysis/metrics";

function getAdminClient() {
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

export async function POST(request: Request) {
  try {
    const provider = getProvider();
    const isValid = await provider.verifyWebhook(request.clone());
    if (!isValid) {
      return NextResponse.json({ error: "Invalid webhook" }, { status: 401 });
    }

    const result = await provider.parseWebhook(request);
    const admin = getAdminClient();

    // Find the recording by transcription ID
    const { data: recording } = await admin
      .from("recordings")
      .select("*")
      .eq("transcription_id", result.id)
      .single();

    if (!recording) {
      return NextResponse.json({ error: "Recording not found" }, { status: 404 });
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

      return NextResponse.json({ status: "error" });
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

    // Delete audio from storage
    if (recording.drive_audio_id) {
      await admin.storage
        .from("recordings")
        .remove([recording.drive_audio_id])
        .catch(() => {});
    }

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
        drive_audio_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", recording.id);

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
