"use client";

import { useState } from "react";

interface ManagerRecording {
  id: string;
  label: string;
  filename: string;
  recorded_at: string;
  duration_seconds: number | null;
  status: string;
  error: string | null;
  profiles: { name: string };
}

interface ManagerDashboardProps {
  recordings: ManagerRecording[];
}

const statusColors: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  uploading: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  transcribing: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  done: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export function ManagerDashboard({ recordings }: ManagerDashboardProps) {
  const [filterWorker, setFilterWorker] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const workers = [...new Set(recordings.map((r) => r.profiles.name))];
  const statuses = [...new Set(recordings.map((r) => r.status))];

  const filtered = recordings.filter((r) => {
    if (filterWorker && r.profiles.name !== filterWorker) return false;
    if (filterStatus && r.status !== filterStatus) return false;
    return true;
  });

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex gap-3">
        <select
          value={filterWorker}
          onChange={(e) => setFilterWorker(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
        >
          <option value="">All workers</option>
          {workers.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
        >
          <option value="">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                Worker
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                Recording
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                Date
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                Status
              </th>
              <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((rec) => (
              <tr key={rec.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 text-sm">{rec.profiles.name}</td>
                <td className="px-4 py-3 font-medium">{rec.label}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {new Date(rec.recorded_at).toLocaleDateString("cs-CZ")}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[rec.status] || statusColors.pending}`}
                  >
                    {rec.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {rec.status === "done" && (
                    <a
                      href={`/transcript/${rec.id}`}
                      className="text-sm text-primary hover:underline"
                    >
                      View
                    </a>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No recordings found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
