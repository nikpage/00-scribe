"use client";

import { useState } from "react";
import type { TranslationKey } from "@/lib/i18n";
import { useLang } from "@/hooks/use-lang";
import { RecordingAnalysis } from "@/components/recording-analysis";
import { NotesSection } from "@/components/notes-section";
import { DashboardStats } from "@/components/dashboard-stats";
import type { Recording } from "@/hooks/use-recordings";

interface ManagerRecording extends Recording {
  profiles: { name: string };
  user_id: string;
}

interface ManagerDashboardProps {
  recordings: ManagerRecording[];
  onRefetch?: () => void;
}

const statusColors: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  uploading: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  transcribing: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  done: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

interface WorkerSummary {
  id: string;
  name: string;
  total: number;
  completed: number;
  totalMinutes: number;
  avgQuality: number | null;
  avgEmpathy: number | null;
}

function computeWorkerSummaries(recordings: ManagerRecording[]): WorkerSummary[] {
  const map = new Map<string, ManagerRecording[]>();
  for (const r of recordings) {
    const list = map.get(r.user_id) || [];
    list.push(r);
    map.set(r.user_id, list);
  }

  return Array.from(map.entries()).map(([userId, recs]) => {
    const done = recs.filter((r) => r.status === "done");
    const analyzed = done.filter((r) => r.analysis);
    return {
      id: userId,
      name: recs[0].profiles.name,
      total: recs.length,
      completed: done.length,
      totalMinutes: Math.round(recs.reduce((s, r) => s + (r.duration_seconds || 0), 0) / 60),
      avgQuality: analyzed.length > 0
        ? Math.round(analyzed.reduce((s, r) => s + (r.analysis?.qualityScore || 0), 0) / analyzed.length * 10) / 10
        : null,
      avgEmpathy: analyzed.length > 0
        ? Math.round(analyzed.reduce((s, r) => s + (r.analysis?.empathyScore || 0), 0) / analyzed.length * 10) / 10
        : null,
    };
  });
}

export function ManagerDashboard({ recordings, onRefetch }: ManagerDashboardProps) {
  const { lang, t } = useLang();
  const [filterWorker, setFilterWorker] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [selectedWorker, setSelectedWorker] = useState<string | null>(null);
  const [expandedRecording, setExpandedRecording] = useState<string | null>(null);

  const workers = [...new Set(recordings.map((r) => r.profiles.name))];
  const statuses = [...new Set(recordings.map((r) => r.status))];
  const workerSummaries = computeWorkerSummaries(recordings);

  const filtered = recordings.filter((r) => {
    if (selectedWorker && r.user_id !== selectedWorker) return false;
    if (filterWorker && r.profiles.name !== filterWorker) return false;
    if (filterStatus && r.status !== filterStatus) return false;
    return true;
  });

  // If drill-down into a specific worker
  if (selectedWorker) {
    const workerRecs = recordings.filter((r) => r.user_id === selectedWorker);
    const worker = workerSummaries.find((w) => w.id === selectedWorker);

    return (
      <div>
        <button
          onClick={() => setSelectedWorker(null)}
          className="mb-4 text-sm text-primary hover:underline"
        >
          {t("backToOverview")}
        </button>

        <h3 className="mb-4 text-xl font-bold">{worker?.name}</h3>

        <DashboardStats recordings={workerRecs} />

        {/* Worker notes */}
        <div className="mb-6 rounded-lg border border-border p-4">
          <NotesSection type="worker" targetId={selectedWorker} />
        </div>

        {/* Worker's recordings */}
        <div className="space-y-3">
          {workerRecs.map((rec) => (
            <div
              key={rec.id}
              className="rounded-lg border border-border bg-background p-4"
            >
              <div
                className="flex items-start justify-between cursor-pointer"
                onClick={() => setExpandedRecording(expandedRecording === rec.id ? null : rec.id)}
              >
                <div className="min-w-0 flex-1">
                  <h4 className="truncate font-medium">{rec.label}</h4>
                  <p className="text-sm text-muted-foreground">
                    {new Date(rec.recorded_at).toLocaleDateString(lang === "cs" ? "cs-CZ" : "en-US", {
                      day: "numeric", month: "numeric", year: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </p>
                  {rec.analysis && expandedRecording !== rec.id && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-1">
                      {rec.analysis.summary}
                    </p>
                  )}
                </div>
                <div className="ml-2 flex items-center gap-2">
                  {rec.analysis && (
                    <span className="text-xs text-primary font-medium">{rec.analysis.qualityScore}/5</span>
                  )}
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[rec.status] || statusColors.pending}`}
                  >
                    {t(rec.status as TranslationKey)}
                  </span>
                </div>
              </div>

              {expandedRecording === rec.id && (
                <>
                  <RecordingAnalysis recording={rec} onAnalysisComplete={onRefetch} />
                  <div className="mt-3 border-t border-border pt-3">
                    <NotesSection type="recording" targetId={rec.id} />
                  </div>
                  {rec.status === "done" && (
                    <div className="mt-2">
                      <a
                        href={`/transcript/${rec.id}`}
                        className="text-sm text-primary hover:underline"
                      >
                        {t("viewTranscript")}
                      </a>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Overview mode
  return (
    <div>
      <DashboardStats recordings={recordings} />

      {/* Worker Performance Table */}
      <div className="mb-6">
        <h3 className="mb-3 text-lg font-bold">{t("workerPerformance")}</h3>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">{t("worker")}</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-muted-foreground">{t("totalRecordings")}</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-muted-foreground">{t("completed")}</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-muted-foreground">{t("duration")}</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-muted-foreground">{t("avgQuality")}</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-muted-foreground">{t("avgEmpathy")}</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {workerSummaries.map((w) => (
                <tr key={w.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">{w.name}</td>
                  <td className="px-4 py-3 text-center text-sm">{w.total}</td>
                  <td className="px-4 py-3 text-center text-sm">{w.completed}</td>
                  <td className="px-4 py-3 text-center text-sm">{w.totalMinutes} {t("minutes")}</td>
                  <td className="px-4 py-3 text-center text-sm">
                    {w.avgQuality !== null ? `${w.avgQuality}/5` : "—"}
                  </td>
                  <td className="px-4 py-3 text-center text-sm">
                    {w.avgEmpathy !== null ? `${w.avgEmpathy}/5` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setSelectedWorker(w.id)}
                      className="text-sm text-primary hover:underline"
                    >
                      {t("drillDown")}
                    </button>
                  </td>
                </tr>
              ))}
              {workerSummaries.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    {t("noRecordsFound")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* All Recordings Table (filterable) */}
      <h3 className="mb-3 text-lg font-bold">{t("recordings")}</h3>
      <div className="mb-4 flex gap-3">
        <select
          value={filterWorker}
          onChange={(e) => setFilterWorker(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
        >
          <option value="">{t("allWorkers")}</option>
          {workers.map((w) => (
            <option key={w} value={w}>{w}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
        >
          <option value="">{t("allStatuses")}</option>
          {statuses.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">{t("worker")}</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">{t("recording")}</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">{t("date")}</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">{t("duration")}</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">{t("qualityScore")}</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">{t("status")}</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">{t("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((rec) => (
              <tr key={rec.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 text-sm">{rec.profiles.name}</td>
                <td className="px-4 py-3 font-medium">{rec.label}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {new Date(rec.recorded_at).toLocaleDateString(lang === "cs" ? "cs-CZ" : "en-US")}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {rec.duration_seconds ? `${Math.round(rec.duration_seconds / 60)} ${t("minutes")}` : "—"}
                </td>
                <td className="px-4 py-3 text-sm">
                  {rec.analysis ? `${rec.analysis.qualityScore}/5` : "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[rec.status] || statusColors.pending}`}
                  >
                    {t(rec.status as TranslationKey)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {rec.status === "done" && (
                    <a href={`/transcript/${rec.id}`} className="text-sm text-primary hover:underline">
                      {t("view")}
                    </a>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  {t("noRecordsFound")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
