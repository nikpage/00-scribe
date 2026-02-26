import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (e) {
    return NextResponse.json(
      { error: `[FormData] ${e instanceof Error ? e.message : "parse failed"}` },
      { status: 400 }
    );
  }

  const file = formData.get("file") as File | null;
  const recordingId = formData.get("recordingId") as string;
  const filename = formData.get("filename") as string;

  if (!file || !recordingId || !filename) {
    return NextResponse.json(
      { error: `[Fields] file=${!!file} recordingId=${!!recordingId} filename=${!!filename}` },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  try {
    await admin
      .from("recordings")
      .update({ status: "uploading" })
      .eq("id", recordingId);

    // Ensure bucket exists (idempotent)
    await admin.storage.createBucket("recordings", { public: false }).catch(() => {});

    const storagePath = `${user.id}/${filename}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadErr } = await admin.storage
      .from("recordings")
      .upload(storagePath, buffer, {
        contentType: file.type || "audio/webm",
        upsert: true,
      });

    if (uploadErr) throw new Error(`[Storage] ${uploadErr.message}`);

    await admin
      .from("recordings")
      .update({ drive_audio_id: storagePath })
      .eq("id", recordingId);

    return NextResponse.json({ storagePath });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upload failed";

    await admin
      .from("recordings")
      .update({ status: "failed", error: msg })
      .eq("id", recordingId);

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
