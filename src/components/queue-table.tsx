"use client";

import type { Recording } from "@/hooks/use-recordings";

interface QueueTableProps {
  recordings: Recording[];
  onUpload: (id: string) => void;
  onRetry: (id: string) => void;
}

const statusColors: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  uploading: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  transcribing: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  done: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function QueueTable({ recordings, onUpload, onRetry }: QueueTableProps) {
  return (
    <div className="space-y-3">
      {recordings.map((rec) => (
        <div
          key={rec.id}
          className="rounded-lg border border-border bg-background p-4"
        >
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-medium">{rec.label}</h3>
              <p className="text-sm text-muted-foreground">
                {formatDate(rec.recorded_at)}
              </p>
              <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                <span>{formatDuration(rec.duration_seconds)}</span>
                <span>{formatSize(rec.file_size_bytes)}</span>
              </div>
            </div>
            <span
              className={`ml-2 shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[rec.status] || statusColors.pending}`}
            >
              {rec.status}
            </span>
          </div>

          {rec.error && (
            <p className="mt-2 text-sm text-destructive">{rec.error}</p>
          )}

          <div className="mt-3 flex gap-2">
            {rec.status === "pending" && (
              <button
                onClick={() => onUpload(rec.id)}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-light"
              >
                Upload
              </button>
            )}
            {rec.status === "failed" && (
              <button
                onClick={() => onRetry(rec.id)}
                className="rounded-md bg-warning px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
              >
                Retry
              </button>
            )}
            {rec.status === "done" && (
              <a
                href={`/transcript/${rec.id}`}
                className="rounded-md bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:opacity-90"
              >
                View Transcript
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
