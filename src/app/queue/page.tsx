"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRecordings } from "@/hooks/use-recordings";
import { useLang } from "@/hooks/use-lang";
import { QueueTable } from "@/components/queue-table";
import { getRecordingBlob, deleteRecordingBlob } from "@/lib/audio-store";

export default function QueuePage() {
  const { lang, t } = useLang();
  const [userId, setUserId] = useState<string>();
  const [authed, setAuthed] = useState(false);
  const [pageError, setPageError] = useState("");
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace("/auth/login");
      } else {
        setUserId(user.id);
        setAuthed(true);
      }
    });
  }, [supabase, router]);

  // Show errors passed from record page
  useEffect(() => {
    const err = sessionStorage.getItem("scribe-error");
    if (err) {
      setPageError(err);
      sessionStorage.removeItem("scribe-error");
    }
  }, []);

  const { recordings, loading } = useRecordings(userId);

  async function handleUpload(recordingId: string) {
    const blob = await getRecordingBlob(recordingId);

    if (!blob) {
      await supabase
        .from("recordings")
        .update({ status: "failed", error: "Audio file lost — please re-record" })
        .eq("id", recordingId);
      return;
    }

    const recording = recordings.find((r) => r.id === recordingId);
    if (!recording) return;

    try {
      await supabase
        .from("recordings")
        .update({ status: "uploading" })
        .eq("id", recordingId);

      // 1. Get resumable upload URI from our API
      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordingId,
          filename: recording.filename,
          mimeType: blob.type || "audio/webm",
        }),
      });

      if (!uploadRes.ok) {
        const errData = await uploadRes.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to get upload URI");
      }
      const { uploadUri } = await uploadRes.json();

      // 2. Upload directly to Google Drive
      const driveRes = await fetch(uploadUri, {
        method: "PUT",
        headers: {
          "Content-Type": blob.type || "audio/webm",
          "Content-Length": blob.size.toString(),
        },
        body: blob,
      });

      if (!driveRes.ok) throw new Error("Upload to Drive failed");
      const driveData = await driveRes.json();
      const driveFileId = driveData.id;

      // 3. Submit for transcription
      await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordingId, driveFileId }),
      });

      // 4. Audio is on Drive — remove from IndexedDB
      await deleteRecordingBlob(recordingId);
    } catch (err) {
      await supabase
        .from("recordings")
        .update({
          status: "failed",
          error: err instanceof Error ? err.message : "Upload failed",
        })
        .eq("id", recordingId);
    }
  }

  async function handleUploadAll() {
    const pending = recordings.filter((r) => r.status === "pending");
    for (const rec of pending) {
      await handleUpload(rec.id);
    }
  }

  async function handleRetry(recordingId: string) {
    await supabase
      .from("recordings")
      .update({ status: "pending", error: null })
      .eq("id", recordingId);
    await handleUpload(recordingId);
  }

  if (!authed) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-muted-foreground">...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-background px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">{t("recordings")}</h1>
          <a
            href="/record"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-light"
          >
            {t("new")}
          </a>
        </div>
      </header>

      <main className="p-4">
        {pageError && (
          <div className="mb-4 rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            {pageError}
            <button
              onClick={() => setPageError("")}
              className="ml-2 font-medium underline"
            >
              dismiss
            </button>
          </div>
        )}

        {loading ? (
          <div className="text-center text-muted-foreground">{t("loading")}</div>
        ) : recordings.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <p>{t("noRecordings")}</p>
            <a href="/record" className="mt-2 inline-block text-primary hover:underline">
              {t("createFirst")}
            </a>
          </div>
        ) : (
          <>
            {recordings.some((r) => r.status === "pending") && (
              <button
                onClick={handleUploadAll}
                className="mb-4 w-full rounded-lg border border-primary bg-background px-4 py-2 text-sm font-medium text-primary hover:bg-muted"
              >
                {t("uploadAllPending")}
              </button>
            )}
            <QueueTable
              recordings={recordings}
              onUpload={handleUpload}
              onRetry={handleRetry}
            />
          </>
        )}
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 border-t border-border bg-background md:hidden">
        <div className="flex justify-around py-2">
          <a href="/queue" className="flex flex-col items-center p-2 text-primary">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            <span className="text-xs">{t("queue")}</span>
          </a>
          <a href="/record" className="flex flex-col items-center p-2 text-muted-foreground">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="text-xs">{t("record")}</span>
          </a>
          <a href="/transcripts" className="flex flex-col items-center p-2 text-muted-foreground">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-xs">{t("transcripts")}</span>
          </a>
        </div>
      </nav>
    </div>
  );
}
