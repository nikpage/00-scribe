import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResumableUploadUri, getOrCreateWorkerFolder } from "@/lib/google-drive";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { recordingId, filename, mimeType } = await request.json();
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
    const workerFolderId = await getOrCreateWorkerFolder(profile.name);
    const uploadUri = await getResumableUploadUri(filename, mimeType, workerFolderId);

    await admin
      .from("recordings")
      .update({ status: "uploading" })
      .eq("id", recordingId);

    return NextResponse.json({ uploadUri, workerFolderId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}
