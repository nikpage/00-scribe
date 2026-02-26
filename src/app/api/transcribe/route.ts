import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDownloadUrl } from "@/lib/google-drive";
import { getProvider } from "@/lib/transcription";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { recordingId, driveFileId } = await request.json();
  const admin = createAdminClient();

  try {
    await admin
      .from("recordings")
      .update({
        drive_audio_id: driveFileId,
        status: "transcribing",
      })
      .eq("id", recordingId);

    const audioUrl = await getDownloadUrl(driveFileId);
    const provider = getProvider();
    const { id: transcriptionId } = await provider.submit(audioUrl);

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
