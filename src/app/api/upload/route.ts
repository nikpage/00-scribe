import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadFile, getOrCreateWorkerFolder } from "@/lib/google-drive";

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
  } catch {
    return NextResponse.json(
      { error: "Invalid form data. File may exceed size limit (~4.5 MB)." },
      { status: 400 }
    );
  }

  const file = formData.get("file") as File | null;
  const recordingId = formData.get("recordingId") as string;
  const filename = formData.get("filename") as string;

  if (!file || !recordingId || !filename) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  try {
    await admin
      .from("recordings")
      .update({ status: "uploading" })
      .eq("id", recordingId);

    const workerFolderId = await getOrCreateWorkerFolder(profile.name);
    const buffer = Buffer.from(await file.arrayBuffer());
    const driveFileId = await uploadFile(
      filename,
      buffer,
      file.type || "audio/webm",
      workerFolderId
    );

    await admin
      .from("recordings")
      .update({ drive_audio_id: driveFileId })
      .eq("id", recordingId);

    return NextResponse.json({ driveFileId });
  } catch (err) {
    await admin
      .from("recordings")
      .update({
        status: "failed",
        error: err instanceof Error ? err.message : "Upload failed",
      })
      .eq("id", recordingId);

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}
