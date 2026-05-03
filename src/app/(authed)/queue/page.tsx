"use client";

import { useEffect, useState } from "react";
import { useRecordings } from "@/hooks/use-recordings";
import { useLang } from "@/hooks/use-lang";
import { useAppUser } from "@/components/app-shell";
import { QueueTable } from "@/components/queue-table";
import { DashboardStats } from "@/components/dashboard-stats";
import { getRecordingBlob, deleteRecordingBlob } from "@/lib/audio-store";
import { encodeWav } from "@/lib/encode-wav";

export default function QueuePage() {
  const { t } = useLang();
  const user = useAppUser();
  const [pageError, setPageError] = useState("");

  useEffect(() => {
    const err = sessionStorage.getItem("scribe-error");
    if (err) {
      setPageError(err);
      sessionStorage.removeItem("scribe-error");
    }
  }, []);

  const { recordings, loading, refetch } = useRecordings(user.id);
  const [retranscribingId, setRetranscribingId] = useState<string | null>(null);

  async function updateStatus(recordingId: string, status: string, error?: string) {
    await fetch("/api/recordings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recordingId, status, error }),
    });
  }

  async function handleUpload(recordingId: string) {
    const blob = await getRecordingBlob(recordingId);

    if (!blob) {
      await updateStatus(recordingId, "failed", t("audioLost"));
      refetch();
      return;
    }

    const recording = recordings.find((r) => r.id === recordingId);
    if (!recording) return;

    try {
      const wavBlob = await encodeWav(blob);
      const wavFilename = recording.filename.replace(/\.[^.]+$/, ".wav");
      const formData = new FormData();
      formData.append("file", wavBlob, wavFilename);
      formData.append("recordingId", recordingId);
      formData.append("filename", recording.filename);

      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        const errData = await uploadRes.json().catch(() => ({}));
        throw new Error(errData.error || t("uploadFailed"));
      }

      await uploadRes.json();

      const transcribeRes = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordingId }),
      });

      if (!transcribeRes.ok) {
        const errData = await transcribeRes.json().catch(() => ({}));
        throw new Error(errData.error || t("transcriptionFailed"));
      }

      await deleteRecordingBlob(recordingId);
      refetch();
    } catch (err) {
      await updateStatus(
        recordingId,
        "failed",
        err instanceof Error ? err.message : t("uploadFailed")
      );
      refetch();
    }
  }

  async function handleUploadAll() {
    const pending = recordings.filter((r) => r.status === "pending");
    for (const rec of pending) {
      await handleUpload(rec.id);
    }
  }

  async function handleRetry(recordingId: string) {
    await updateStatus(recordingId, "pending");
    refetch();
    await handleUpload(recordingId);
  }

  async function handleArchive(recordingId: string) {
    await fetch("/api/recordings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recordingId, archived: true }),
    });
    refetch();
  }

  async function handleRetranscribe(recordingId: string) {
    setRetranscribingId(recordingId);
    try {
      await updateStatus(recordingId, "transcribing");
      refetch();

      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordingId }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Re-transcription failed");
      }

      refetch();
    } catch (err) {
      await updateStatus(
        recordingId,
        "failed",
        err instanceof Error ? err.message : "Re-transcription failed"
      );
      refetch();
    } finally {
      setRetranscribingId(null);
    }
  }

  return (
    <>
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
              {t("dismiss")}
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
            <DashboardStats recordings={recordings} />
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
              onRetranscribe={handleRetranscribe}
              onArchive={handleArchive}
              retranscribingId={retranscribingId}
              onRefetch={refetch}
            />
          </>
        )}
      </main>
    </>
  );
}
