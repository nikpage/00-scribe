"use client";

import { useRecordings } from "@/hooks/use-recordings";
import { useLang } from "@/hooks/use-lang";
import { useAppUser } from "@/components/app-shell";

export default function TranscriptsPage() {
  const { lang, t } = useLang();
  const user = useAppUser();
  const { recordings, loading } = useRecordings(user.id);
  const completed = recordings.filter((r) => r.status === "done");

  return (
    <main className="p-4 md:p-6">
      <h2 className="mb-6 text-2xl font-bold">{t("transcripts")}</h2>

      {loading ? (
        <div className="text-muted-foreground">{t("loading")}</div>
      ) : completed.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          {t("noTranscripts")}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                  {t("name")}
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                  {t("date")}
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                  {t("duration")}
                </th>
                <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">
                  {t("actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {completed.map((rec) => (
                <tr key={rec.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">{rec.label}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {new Date(rec.recorded_at).toLocaleDateString(lang === "cs" ? "cs-CZ" : "en-US")}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {rec.duration_seconds
                      ? `${Math.floor(rec.duration_seconds / 60)}:${(rec.duration_seconds % 60).toString().padStart(2, "0")}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={`/transcript/${rec.id}`}
                      className="text-sm text-primary hover:underline"
                    >
                      {t("view")}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
