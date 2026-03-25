"use client";

import { useState } from "react";
import type { Recording } from "@/hooks/use-recordings";
import { useLang } from "@/hooks/use-lang";

interface RecordingAnalysisProps {
  recording: Recording;
  onAnalysisComplete?: () => void;
}

function ScoreBadge({ score, max = 5 }: { score: number; max?: number }) {
  const pct = score / max;
  const color =
    pct >= 0.8
      ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
      : pct >= 0.6
        ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
        : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {score}/{max}
    </span>
  );
}

function BarSegment({ ratio, label, color }: { ratio: number; label: string; color: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.round(ratio * 100)}%` }} />
      </div>
      <span className="w-20 shrink-0 text-muted-foreground">{label} {Math.round(ratio * 100)}%</span>
    </div>
  );
}

export function RecordingAnalysis({ recording, onAnalysisComplete }: RecordingAnalysisProps) {
  const { t } = useLang();
  const [analyzing, setAnalyzing] = useState(false);

  const { analysis, metrics } = recording;

  async function handleRunAnalysis() {
    setAnalyzing(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordingId: recording.id }),
      });
      if (res.ok) {
        onAnalysisComplete?.();
      }
    } catch {
      // silent
    }
    setAnalyzing(false);
  }

  if (recording.status !== "done") return null;

  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      {/* AI Summary */}
      {analysis ? (
        <>
          <div>
            <h4 className="text-xs font-medium text-muted-foreground">{t("summary")}</h4>
            <p className="mt-1 text-sm">{analysis.summary}</p>
          </div>

          {/* Scores row */}
          <div className="flex flex-wrap gap-4">
            <div>
              <span className="text-xs text-muted-foreground">{t("qualityScore")}</span>
              <div className="mt-0.5"><ScoreBadge score={analysis.qualityScore} /></div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">{t("empathy")}</span>
              <div className="mt-0.5"><ScoreBadge score={analysis.empathyScore} /></div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">{t("questionQuality")}</span>
              <div className="mt-0.5 text-xs">
                {t("openQuestions")}: {analysis.questionQuality.openQuestions} / {t("closedQuestions")}: {analysis.questionQuality.closedQuestions}
              </div>
            </div>
          </div>

          {/* Quality note */}
          {analysis.qualityNotes && (
            <p className="text-xs text-muted-foreground italic">{analysis.qualityNotes}</p>
          )}

          {/* Key Topics */}
          {analysis.keyTopics.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground">{t("keyTopics")}</h4>
              <div className="mt-1 flex flex-wrap gap-1">
                {analysis.keyTopics.map((topic) => (
                  <span key={topic} className="rounded-full bg-muted px-2 py-0.5 text-xs">{topic}</span>
                ))}
              </div>
            </div>
          )}

          {/* Action Items */}
          {analysis.actionItems.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground">{t("actionItems")}</h4>
              <ul className="mt-1 list-inside list-disc text-sm">
                {analysis.actionItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t("noAnalysis")}</span>
          {recording.transcript && (
            <button
              onClick={handleRunAnalysis}
              disabled={analyzing}
              className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-white hover:bg-primary-light disabled:opacity-50"
            >
              {analyzing ? t("analyzing") : t("runAnalysis")}
            </button>
          )}
        </div>
      )}

      {/* Computed Metrics */}
      {metrics && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground">{t("metrics")}</h4>
          <div className="mt-1 space-y-1.5">
            {Object.entries(metrics.speakerMetrics).map(([speakerId, sm]) => {
              const speakerName = recording.speakers?.[speakerId] || `${t("speaker")} ${speakerId}`;
              return (
                <BarSegment
                  key={speakerId}
                  ratio={sm.talkRatio}
                  label={speakerName}
                  color={speakerId === "0" ? "bg-primary" : "bg-warning"}
                />
              );
            })}
          </div>
          <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
            <span>{t("turns")}: {metrics.totalTurns}</span>
            <span>{t("avgResponseLength")}: {metrics.avgTurnLength} {t("words")}</span>
            <span>{metrics.totalWords} {t("words")}</span>
          </div>
        </div>
      )}
    </div>
  );
}
