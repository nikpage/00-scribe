import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProvider } from "@/lib/transcription";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { recordingId } = await request.json();
  const admin = createAdminClient();

  try {
    const { data: recording } = await admin
      .from("recordings")
      .select("drive_audio_id")
      .eq("id", recordingId)
      .single();

    if (!recording?.drive_audio_id) {
      return NextResponse.json({ error: "Recording audio not found" }, { status: 404 });
    }

    await admin
      .from("recordings")
      .update({ status: "transcribing" })
      .eq("id", recordingId);

    // Create signed URL for AssemblyAI to download (valid 1 hour)
    const { data: urlData, error: urlErr } = await admin.storage
      .from("recordings")
      .createSignedUrl(recording.drive_audio_id, 3600);

    if (urlErr || !urlData?.signedUrl) {
      throw new Error(`[SignedUrl] ${urlErr?.message || "failed to create"}`);
    }

    const provider = getProvider();
    const { id: transcriptionId } = await provider.submit(urlData.signedUrl);

    await admin
      .from("recordings")
      .update({ transcription_id: transcriptionId })
      .eq("id", recordingId);

    return NextResponse.json({ transcriptionId });
  } catch (err) {
    await admin
      .from("recordings")
      .update({
        status: "failed",
        error: err instanceof Error ? err.message : "Transcription submission failed",
      })
      .eq("id", recordingId);

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Transcription failed" },
      { status: 500 }
    );
  }
}
