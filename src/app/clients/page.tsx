"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLang } from "@/hooks/use-lang";
import { BottomNav } from "@/components/bottom-nav";

interface ClientSummary {
  id: string;
  name: string;
  address: string | null;
  visits: number;
  last_visit: string;
  action_count: number;
}

export default function ClientsPage() {
  const { lang, t } = useLang();
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace("/auth/login");
        return;
      }
      setAuthed(true);
      fetch("/api/clients")
        .then((r) => r.json())
        .then((data) => setClients(data.clients || []))
        .finally(() => setLoading(false));
    });
  }, [supabase, router]);

  if (!authed) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-muted-foreground">...</div>
      </div>
    );
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(lang === "cs" ? "cs-CZ" : "en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

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
          <h2 className="mb-6 text-2xl font-bold">{t("myClients")}</h2>

          {loading ? (
            <div className="text-muted-foreground">{t("loading")}</div>
          ) : clients.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">{t("noClients")}</div>
          ) : (
            <ul className="space-y-2">
              {clients.map((c) => (
                <li key={c.id}>
                  <a
                    href={`/clients/${c.id}`}
                    className="block rounded-lg border border-border bg-background p-4 hover:bg-muted"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium">{c.name}</div>
                        {c.address && (
                          <div className="truncate text-xs text-muted-foreground">{c.address}</div>
                        )}
                      </div>
                      <div className="shrink-0 text-right text-xs text-muted-foreground">
                        {formatDate(c.last_visit)}
                      </div>
                    </div>
                    <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
                      <span>{c.visits} {c.visits === 1 ? t("visitOne") : t("visitMany")}</span>
                      {c.action_count > 0 && (
                        <span>{c.action_count} {t("actionItems").toLowerCase()}</span>
                      )}
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </main>
      </div>

      <BottomNav active="clients" />
    </div>
  );
}
