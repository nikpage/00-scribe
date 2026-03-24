"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRecordings } from "@/hooks/use-recordings";
import { useLang } from "@/hooks/use-lang";

export default function TranscriptsPage() {
  const { lang, t } = useLang();
  const [userId, setUserId] = useState<string>();
  const [authed, setAuthed] = useState(false);
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

  const { recordings, loading } = useRecordings(userId);
  const completed = recordings.filter((r) => r.status === "done");

  if (!authed) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-muted-foreground">...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar layout */}
      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden w-64 shrink-0 border-r border-border bg-muted/50 md:block">
          <div className="p-6">
            <h1 className="text-xl font-bold">Scribe</h1>
          </div>
          <nav className="space-y-1 px-3">
            <a
              href="/transcripts"
              className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm font-medium text-primary"
            >
              {t("transcripts")}
            </a>
            <a
              href="/queue"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
            >
              {t("queue")}
            </a>
            <a
              href="/manager"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
            >
              {t("manager")}
            </a>
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-6">
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
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 border-t border-border bg-background md:hidden">
        <div className="flex justify-around py-2">
          <a href="/queue" className="flex flex-col items-center p-2 text-muted-foreground">
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
          <a href="/transcripts" className="flex flex-col items-center p-2 text-primary">
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
