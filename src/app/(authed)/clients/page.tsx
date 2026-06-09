"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/hooks/use-lang";
import { useAppUser } from "@/components/app-shell";

interface ClientSummary {
  id: string;
  name: string;
  address: string | null;
  visits: number;
  last_visit: string | null;
  action_count: number;
  worker_count: number;
}

export default function ClientsPage() {
  const { lang, t } = useLang();
  const user = useAppUser();
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadClients() {
    const r = await fetch("/api/clients");
    const data = await r.json();
    setClients(data.clients || []);
  }

  useEffect(() => {
    loadClients().finally(() => setLoading(false));
  }, []);

  function formatDate(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString(lang === "cs" ? "cs-CZ" : "en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  return (
    <main className="p-4 md:p-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">{user.isManager ? t("allClients") : t("myClients")}</h2>
      </div>

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
                  {user.isManager && c.worker_count > 1 && (
                    <span>· {c.worker_count} {t("workers").toLowerCase()}</span>
                  )}
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
  );
}
