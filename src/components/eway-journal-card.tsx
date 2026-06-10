"use client";

import { useEffect, useRef, useState } from "react";
import { useLang } from "@/hooks/use-lang";

interface ContactOption {
  guid: string;
  name: string;
  email: string | null;
}

interface EwayJournalCardProps {
  // The client name to seed the contact search with.
  clientName: string;
  // Pre-filled Poznámka text (the transcribed notes).
  initialNote: string;
  // ISO datetime to seed the time suggestion from (the phone's recording time).
  recordedAt: string;
  // The eWay contact chosen up front on the record screen, if any. When set,
  // it's pre-selected and no search is needed.
  initialContactGuid?: string | null;
  initialContactName?: string | null;
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

export function EwayJournalCard({
  clientName,
  initialNote,
  recordedAt,
  initialContactGuid,
  initialContactName,
}: EwayJournalCardProps) {
  const { lang, t } = useLang();

  // Contact: pre-selected from the record screen when we have its GUID.
  const seededContact: ContactOption | null = initialContactGuid
    ? { guid: initialContactGuid, name: initialContactName || clientName, email: null }
    : null;
  const [query, setQuery] = useState(seededContact?.name ?? clientName);
  const [results, setResults] = useState<ContactOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<ContactOption | null>(seededContact);
  const [open, setOpen] = useState(false);

  // Date is always today; time is suggested from the phone but editable.
  const today = new Date();
  const seed = new Date(recordedAt);
  const seedTime = isNaN(seed.getTime()) ? today : seed;
  const [time, setTime] = useState(`${pad(seedTime.getHours())}:${pad(seedTime.getMinutes())}`);

  const [note, setNote] = useState(initialNote);

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  // Debounced contact lookup. Skip while a contact is already picked and the
  // box still shows its name (avoids re-searching right after selection).
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (picked && query === picked.name) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/eway/contacts?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(Array.isArray(data.contacts) ? data.contacts : []);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, picked]);

  function choose(c: ContactOption) {
    setPicked(c);
    setQuery(c.name);
    setOpen(false);
  }

  async function handleSave() {
    if (!picked) {
      setStatus({ ok: false, msg: t("ewayJournalNoContact") });
      return;
    }
    setSaving(true);
    setStatus(null);

    // Combine today's date with the (possibly edited) time.
    const [hh, mm] = time.split(":").map((n) => parseInt(n, 10));
    const start = new Date(today);
    start.setHours(hh || 0, mm || 0, 0, 0);

    try {
      const res = await fetch("/api/eway/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactGuid: picked.guid,
          contactName: picked.name,
          note,
          eventStart: start.toISOString(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setStatus({ ok: true, msg: t("ewayJournalSaved") });
      } else {
        setStatus({ ok: false, msg: data.error || t("ewayJournalFailed") });
      }
    } catch {
      setStatus({ ok: false, msg: t("ewayJournalFailed") });
    } finally {
      setSaving(false);
    }
  }

  const dateLabel = today.toLocaleDateString(lang === "cs" ? "cs-CZ" : "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <section className="mb-6 rounded-lg border border-border bg-background p-4">
      <h3 className="mb-3 text-sm font-semibold">{t("ewayJournalTitle")}</h3>

      {/* Contact picker */}
      <div className="relative mb-3">
        <label className="mb-1 block text-xs text-muted-foreground">{t("ewayJournalContact")}</label>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPicked(null);
          }}
          onFocus={() => results.length && setOpen(true)}
          placeholder={t("ewayJournalContactSearch")}
          autoComplete="off"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        {open && (
          <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-background shadow">
            {searching && (
              <li className="px-3 py-2 text-xs text-muted-foreground">{t("ewayJournalSearching")}</li>
            )}
            {!searching && results.length === 0 && (
              <li className="px-3 py-2 text-xs text-muted-foreground">{t("ewayJournalNoResults")}</li>
            )}
            {results.map((c) => (
              <li key={c.guid}>
                <button
                  type="button"
                  onClick={() => choose(c)}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  {c.name}
                  {c.email && <span className="ml-2 text-xs text-muted-foreground">{c.email}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Date (today) + editable time */}
      <div className="mb-3 flex gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-xs text-muted-foreground">{t("ewayJournalDate")}</label>
          <div className="rounded-lg border border-border bg-muted px-3 py-2 text-sm">{dateLabel}</div>
        </div>
        <div className="w-32">
          <label className="mb-1 block text-xs text-muted-foreground">{t("ewayJournalTime")}</label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
      </div>

      {/* Poznámka */}
      <div className="mb-3">
        <label className="mb-1 block text-xs text-muted-foreground">{t("ewayJournalNote")}</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={6}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !picked}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-light disabled:opacity-50"
        >
          {saving ? t("ewayJournalSaving") : t("ewayJournalSave")}
        </button>
        {status && (
          <span className={`text-sm ${status.ok ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
            {status.msg}
          </span>
        )}
      </div>
    </section>
  );
}
