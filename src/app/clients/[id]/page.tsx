"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLang } from "@/hooks/use-lang";
import { BottomNav } from "@/components/bottom-nav";

interface ClientRecord {
  id: string;
  name: string;
  address: string | null;
  created_at: string;
}

interface RecordingSummary {
  id: string;
  label: string;
  recorded_at: string;
  duration_seconds: number | null;
  status: string;
  analysis: {
    summary?: string;
    keyTopics?: string[];
    actionItems?: string[];
  } | null;
}

export default function ClientDetailPage() {
  const { lang, t } = useLang();
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const supabase = createClient();
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [recordings, setRecordings] = useState<RecordingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace("/auth/login");
        return;
      }
      setAuthed(true);
      fetch(`/api/clients/${id}`)
        .then(async (r) => {
          if (!r.ok) throw new Error(String(r.status));
          return r.json();
        })
        .then((data) => {
          setClient(data.client);
          setRecordings(data.recordings || []);
        })
        .catch(() => {
          // Not found or no access — bounce back to list
          router.replace("/clients");
        })
        .finally(() => setLoading(false));
    });
  }, [id, supabase, router]);

  function startNewVisit() {
    if (!client) return;
    sessionStorage.setItem(
      "scribe-prefill",
      JSON.stringify({ label: client.name, address: client.address || "" })
    );
    router.push("/record");
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(lang === "cs" ? "cs-CZ" : "en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  // Aggregate topics + action items across all visits.
  const topicCounts = new Map<string, number>();
  const allActionItems: { text: string; recordedAt: string; recordingId: string }[] = [];
  for (const r of recordings) {
    for (const topic of r.analysis?.keyTopics || []) {
      topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
    }
    for (const item of r.analysis?.actionItems || []) {
      allActionItems.push({ text: item, recordedAt: r.recorded_at, recordingId: r.id });
    }
  }
  const recurringTopics = Array.from(topicCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  if (!authed || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-muted-foreground">...</div>
      </div>
    );
  }

  if (!client) return null;

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        <aside className="hidden w-64 shrink-0 border-r border-border bg-muted/50 md:block">
          <div className="p-6">
            <h1 className="text-xl font-bold">{t("appName")}</h1>
          </div>
          <nav className="space-y-1 px-3">
            <a href="/clients" className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm font-medium text-primary">
              {t("clients")}
            </a>
            <a href="/transcripts" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
              {t("transcripts")}
            </a>
            <a href="/queue" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
              {t("queue")}
            </a>
            <a href="/manager" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
              {t("manager")}
            </a>
          </nav>
        </aside>

        <main className="flex-1 p-4 pb-20 md:p-6">
          <a href="/clients" className="text-sm text-primary hover:underline">
            ← {t("backToClients")}
          </a>

          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold">{client.name}</h2>
              {client.address && (
                <p className="text-sm text-muted-foreground">{client.address}</p>
              )}
            </div>
            <button
              onClick={startNewVisit}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-light"
            >
              {t("newVisit")}
            </button>
          </div>

          {recurringTopics.length > 0 && (
            <section className="mt-6">
              <h3 className="mb-2 text-sm font-semibold">{t("recurringTopics")}</h3>
              <div className="flex flex-wrap gap-2">
                {recurringTopics.map(([topic, n]) => (
                  <span
                    key={topic}
                    className="rounded-full bg-muted px-3 py-1 text-xs"
                  >
                    {topic}{n > 1 ? ` · ${n}` : ""}
                  </span>
                ))}
              </div>
            </section>
          )}

          {allActionItems.length > 0 && (
            <section className="mt-6">
              <h3 className="mb-2 text-sm font-semibold">
                {t("actionItems")} ({allActionItems.length})
              </h3>
              <ul className="space-y-1">
                {allActionItems.map((a, i) => (
                  <li key={i} className="text-sm">
                    <a
                      href={`/transcript/${a.recordingId}`}
                      className="block rounded-md border border-border bg-background p-3 hover:bg-muted"
                    >
                      <div>{a.text}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {formatDate(a.recordedAt)}
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-6">
            <h3 className="mb-2 text-sm font-semibold">{t("allVisits")}</h3>
            <ul className="space-y-2">
              {recordings.map((r) => (
                <li key={r.id}>
                  <a
                    href={`/transcript/${r.id}`}
                    className="block rounded-lg border border-border bg-background p-3 hover:bg-muted"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="text-sm font-medium">{formatDate(r.recorded_at)}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.duration_seconds
                          ? `${Math.floor(r.duration_seconds / 60)}:${(r.duration_seconds % 60).toString().padStart(2, "0")}`
                          : t(r.status as never) || r.status}
                      </div>
                    </div>
                    {r.analysis?.summary && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {r.analysis.summary}
                      </p>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </main>
      </div>

      <BottomNav active="clients" />
    </div>
  );
}
