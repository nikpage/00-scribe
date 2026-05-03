"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLang } from "@/hooks/use-lang";
import { useAppUser } from "@/components/app-shell";

interface ClientRecord {
  id: string;
  name: string;
  address: string | null;
  created_by: string | null;
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
  const user = useAppUser();
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [recordings, setRecordings] = useState<RecordingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editError, setEditError] = useState("");

  useEffect(() => {
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
        router.replace("/clients");
      })
      .finally(() => setLoading(false));
  }, [id, router]);

  function openEdit() {
    if (!client) return;
    setEditName(client.name);
    setEditAddress(client.address || "");
    setEditError("");
    setEditing(true);
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editName.trim()) return;
    setSubmitting(true);
    setEditError("");
    try {
      const res = await fetch(`/api/clients/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, address: editAddress }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error || t("saveFailed"));
        return;
      }
      setClient((c) => (c ? { ...c, name: data.client.name, address: data.client.address } : c));
      setEditing(false);
    } catch {
      setEditError(t("saveFailed"));
    } finally {
      setSubmitting(false);
    }
  }

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

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-pulse text-muted-foreground">...</div>
      </div>
    );
  }

  if (!client) return null;

  return (
    <main className="p-4 md:p-6">
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
        <div className="flex gap-2">
          {client.created_by === user.id && !editing && (
            <button
              onClick={openEdit}
              className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              {t("edit")}
            </button>
          )}
          <button
            onClick={startNewVisit}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-light"
          >
            {t("newVisit")}
          </button>
        </div>
      </div>

      {editing && (
        <form
          onSubmit={submitEdit}
          className="mt-4 space-y-3 rounded-lg border border-border bg-background p-4"
        >
          <div>
            <label className="block text-sm font-medium mb-1">
              {t("clientNameLabel")}
            </label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
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
              value={editAddress}
              onChange={(e) => setEditAddress(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary"
              autoComplete="off"
            />
          </div>
          {editError && <p className="text-sm text-destructive">{editError}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!editName.trim() || submitting}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-light disabled:opacity-50"
            >
              {submitting ? t("saving") : t("save")}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg bg-muted px-4 py-2 text-sm font-medium hover:bg-border"
            >
              {t("cancel")}
            </button>
          </div>
        </form>
      )}

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
  );
}
