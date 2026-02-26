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

  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json(
      { error: `[Profile] ${profileErr?.message || "not found for user " + user.id}` },
      { status: 404 }
    );
  }

  try {
    await admin
      .from("recordings")
      .update({ status: "uploading" })
      .eq("id", recordingId);

    let workerFolderId: string;
    try {
      workerFolderId = await getOrCreateWorkerFolder(profile.name);
    } catch (e) {
      throw new Error(`[DriveFolder] ${e instanceof Error ? e.message : String(e)}`);
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(await file.arrayBuffer());
    } catch (e) {
      throw new Error(`[ReadFile] ${e instanceof Error ? e.message : String(e)}`);
    }

    let driveFileId: string;
    try {
      driveFileId = await uploadFile(
        filename,
        buffer,
        file.type || "audio/webm",
        workerFolderId
      );
    } catch (e) {
      throw new Error(`[DriveUpload] ${e instanceof Error ? e.message : String(e)}`);
    }

    await admin
      .from("recordings")
      .update({ drive_audio_id: driveFileId })
      .eq("id", recordingId);

    return NextResponse.json({ driveFileId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upload failed";

    await admin
      .from("recordings")
      .update({ status: "failed", error: msg })
      .eq("id", recordingId);

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
