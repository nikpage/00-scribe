"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function loadClients() {
    const r = await fetch("/api/clients");
    const data = await r.json();
    setClients(data.clients || []);
  }

  useEffect(() => {
    loadClients().finally(() => setLoading(false));
  }, []);

  async function submitNew(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, address: newAddress }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t("saveFailed"));
        return;
      }
      setNewName("");
      setNewAddress("");
      setAdding(false);
      if (data.client?.id) {
        router.push(`/clients/${data.client.id}`);
      } else {
        await loadClients();
      }
    } catch {
      setError(t("saveFailed"));
    } finally {
      setSubmitting(false);
    }
  }

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
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-light"
          >
            + {t("addClient")}
          </button>
        )}
      </div>

      {adding && (
        <form
          onSubmit={submitNew}
          className="mb-6 space-y-3 rounded-lg border border-border bg-background p-4"
        >
          <div>
            <label className="block text-sm font-medium mb-1">
              {t("clientNameLabel")}
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("clientNamePlaceholder")}
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary"
              autoFocus
              autoComplete="off"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              {t("addressLabel")}
            </label>
            <input
              type="text"
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value)}
              placeholder={t("addressPlaceholder")}
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary"
              autoComplete="off"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!newName.trim() || submitting}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-light disabled:opacity-50"
            >
              {submitting ? t("saving") : t("save")}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setNewName("");
                setNewAddress("");
                setError("");
              }}
              className="rounded-lg bg-muted px-4 py-2 text-sm font-medium hover:bg-border"
            >
              {t("cancel")}
            </button>
          </div>
        </form>
      )}

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
