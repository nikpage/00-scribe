import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getProvider } from "@/lib/transcription";
import {
  saveTextFile,
  deleteFile,
  getOrCreateWorkerFolder,
  updateTextFile,
} from "@/lib/google-drive";

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
      .select("*, profiles!inner(name)")
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

    // Save .txt to Drive
    const workerFolderId = await getOrCreateWorkerFolder(recording.profiles.name);
    const text = formatTranscriptText(result.utterances, speakers);
    let driveTextId = recording.drive_text_id;

    if (driveTextId) {
      await updateTextFile(driveTextId, text);
    } else {
      driveTextId = await saveTextFile(
        `${recording.filename}.txt`,
        text,
        workerFolderId
      );
    }

    // Delete audio from Drive
    if (recording.drive_audio_id) {
      try {
        await deleteFile(recording.drive_audio_id);
      } catch {
        // Audio deletion is best-effort
      }
    }

    // Update recording
    await admin
      .from("recordings")
      .update({
        status: "done",
        transcript,
        drive_text_id: driveTextId,
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
