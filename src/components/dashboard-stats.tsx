"use client";

import type { Recording } from "@/hooks/use-recordings";
import { useLang } from "@/hooks/use-lang";

interface DashboardStatsProps {
  recordings: Recording[];
}

export function DashboardStats({ recordings }: DashboardStatsProps) {
  const { t } = useLang();

  const done = recordings.filter((r) => r.status === "done");
  const totalSeconds = recordings.reduce((sum, r) => sum + (r.duration_seconds || 0), 0);
  const totalHours = (totalSeconds / 3600).toFixed(1);
  const avgMinutes = done.length > 0
    ? Math.round(done.reduce((sum, r) => sum + (r.duration_seconds || 0), 0) / done.length / 60)
    : 0;

  const avgQuality = done.length > 0
    ? (done.reduce((sum, r) => sum + (r.analysis?.qualityScore || 0), 0) /
      done.filter((r) => r.analysis).length || 0).toFixed(1)
    : "—";

  const stats = [
    { label: t("totalRecordings"), value: String(recordings.length) },
    { label: t("completed"), value: String(done.length) },
    { label: t("totalHours"), value: `${totalHours} ${t("hours")}` },
    { label: t("avgDuration"), value: `${avgMinutes} ${t("minutes")}` },
    { label: t("avgQuality"), value: avgQuality === "—" ? avgQuality : `${avgQuality}/5` },
  ];

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-lg border border-border bg-background p-3 text-center"
        >
          <p className="text-lg font-bold">{s.value}</p>
          <p className="text-xs text-muted-foreground">{s.label}</p>
        </div>
      ))}
    </div>
  );
}
