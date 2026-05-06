"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/hooks/use-lang";
import { useAppUser } from "@/components/app-shell";

interface FlaggedRecording {
  id: string;
  worker_id: string;
  worker_name: string;
  label: string;
  recorded_at: string;
  duration_seconds: number | null;
  status: string;
  error: string | null;
  quality_score: number | null;
  summary: string | null;
  reasons: ("failed" | "low_quality" | "talk_ratio")[];
}

const reasonStyles: Record<string, string> = {
  failed: "bg-destructive/10 text-destructive",
  low_quality: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  talk_ratio: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
};

export default function NeedsReviewPage() {
  const { lang, t } = useLang();
  const user = useAppUser();
  const [items, setItems] = useState<FlaggedRecording[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user.isManager) return;
    fetch("/api/manager/needs-review")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) {
          setError(data.error || "Failed to load");
          return;
        }
        setItems(data.recordings || []);
      })
      .catch(() => setError("Failed to load"));
  }, [user.isManager]);

  if (!user.isManager) {
    return (
      <main className="p-6">
        <div className="text-center text-muted-foreground">
          <p className="text-lg font-medium">{t("accessDenied")}</p>
          <p className="mt-1">{t("needManager")}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="p-4 md:p-6">
      <div className="mb-6">
        <a href="/manager" className="text-sm text-primary hover:underline">
          ← {t("backToOverview")}
        </a>
        <h2 className="mt-2 text-2xl font-bold">{t("needsReview")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("needsReviewDesc")}</p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {items === null ? (
        <div className="text-muted-foreground">{t("loading")}</div>
      ) : items.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">{t("noFlaggedRecordings")}</div>
      ) : (
        <ul className="space-y-2">
          {items.map((r) => (
            <li key={r.id}>
              <a
                href={r.status === "done" ? `/transcript/${r.id}` : "/manager"}
                className="block rounded-lg border border-border bg-background p-4 hover:bg-muted"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">{r.label}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {r.worker_name} · {new Date(r.recorded_at).toLocaleDateString(lang === "cs" ? "cs-CZ" : "en-US")}
                    </div>
                  </div>
                  {r.quality_score !== null && (
                    <div className="shrink-0 text-right text-sm font-medium text-primary">
                      {r.quality_score}/5
                    </div>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {r.reasons.map((reason) => (
                    <span
                      key={reason}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${reasonStyles[reason]}`}
                    >
                      {t(`reason_${reason}` as never)}
                    </span>
                  ))}
                </div>

                {r.error && (
                  <p className="mt-2 text-xs text-destructive">{r.error}</p>
                )}
                {r.summary && !r.error && (
                  <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{r.summary}</p>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
