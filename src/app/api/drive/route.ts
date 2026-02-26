import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateTextFile } from "@/lib/google-drive";

export async function PUT(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { recordingId, speakers } = await request.json();
  const admin = createAdminClient();

  const { data: recording } = await admin
    .from("recordings")
    .select("*")
    .eq("id", recordingId)
    .single();

  if (!recording) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  await admin
    .from("recordings")
    .update({ speakers, updated_at: new Date().toISOString() })
    .eq("id", recordingId);

  if (recording.drive_text_id && recording.transcript) {
    const text = recording.transcript.utterances
      .map((u: { speaker: string; text: string }) => {
        const name = speakers[u.speaker] || `Speaker ${u.speaker}`;
        return `${name}: ${u.text}`;
      })
      .join("\n\n");

    await updateTextFile(recording.drive_text_id, text);
  }

  return NextResponse.json({ success: true });
}
