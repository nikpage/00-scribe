"use client";

import { useEffect, useMemo, useState } from "react";
import { useLang } from "@/hooks/use-lang";
import { useEwayAttention } from "@/components/app-shell";
import { TEAMS, DEFAULT_TOPIC } from "@/lib/eway/teams";

// Meeting minutes. Deliberately off the main nav: most workers only ever
// record client visits, and only note-takers come here (by URL).
//
// The whole screen is one form — team, topic, date, minutes, and a row per
// assignment. Nothing is transcribed or AI-extracted: the note-taker types,
// and picking the person from the team's own member list *is* the assignment.

type Row = { key: number; solverGuid: string; text: string; due: string };

const LAST_TEAM_KEY = "scribe.meeting.lastTeam";

function today(): string {
  // Local date, not UTC — a meeting at 9pm is still today's meeting.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

let nextKey = 1;
function blankRow(): Row {
  return { key: nextKey++, solverGuid: "", text: "", due: "" };
}

export default function MeetingPage() {
  const { t } = useLang();
  const ewayAttention = useEwayAttention();

  const [teamId, setTeamId] = useState(TEAMS[0]?.id ?? "");
  const [topic, setTopic] = useState(DEFAULT_TOPIC);
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<Row[]>([blankRow()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<{ tasks: number } | null>(null);

  // The note-taker almost always writes for the same team; remember it.
  useEffect(() => {
    const last = localStorage.getItem(LAST_TEAM_KEY);
    if (last && TEAMS.some((x) => x.id === last)) setTeamId(last);
  }, []);

  const team = useMemo(() => TEAMS.find((x) => x.id === teamId), [teamId]);

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRow(key: number) {
    setRows((prev) => (prev.length === 1 ? [blankRow()] : prev.filter((r) => r.key !== key)));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaved(null);

    const filled = rows.filter((r) => r.text.trim());
    if (!notes.trim() && filled.length === 0) {
      setError(t("meetingNothingToSave"));
      return;
    }
    if (filled.some((r) => !r.solverGuid)) {
      setError(t("meetingTaskNeedsPerson"));
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/eway/meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          topic: topic.trim(),
          date,
          notes,
          assignments: filled.map((r) => ({
            solverGuid: r.solverGuid,
            text: r.text.trim(),
            due: r.due || null,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 404) {
        // No eWay credentials saved — same contract as the journal card.
        ewayAttention.flag();
        setError(t("ewayNotConnectedHint"));
        return;
      }
      if (!res.ok || !data.ok) {
        setError(data.error || t("meetingSaveFailed"));
        return;
      }
      localStorage.setItem(LAST_TEAM_KEY, teamId);
      setSaved({ tasks: Array.isArray(data.tasks) ? data.tasks.length : 0 });
      setNotes("");
      setRows([blankRow()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("meetingSaveFailed"));
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
  const label = "block text-xs uppercase tracking-wide text-muted-foreground";

  return (
    <main className="p-4 md:p-6">
      <form onSubmit={handleSave} className="mx-auto w-full max-w-xl space-y-6">
        <h1 className="text-2xl font-bold">{t("meetingTitle")}</h1>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={label} htmlFor="team">
              {t("meetingTeam")}
            </label>
            <select
              id="team"
              className={field}
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
            >
              {TEAMS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="topic">
              {t("meetingTopic")}
            </label>
            <input
              id="topic"
              className={field}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>
          <div>
            <label className={label} htmlFor="date">
              {t("meetingDate")}
            </label>
            <input
              id="date"
              type="date"
              className={field}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className={label} htmlFor="notes">
            {t("meetingNotes")}
          </label>
          <textarea
            id="notes"
            className={`${field} min-h-40`}
            placeholder={t("meetingNotesPlaceholder")}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="space-y-3">
          <div className={label}>{t("meetingTasks")}</div>
          {rows.map((row) => (
            <div key={row.key} className="space-y-2 rounded-lg border border-border p-3">
              <input
                className={field}
                placeholder={t("meetingTaskWhat")}
                value={row.text}
                onChange={(e) => updateRow(row.key, { text: e.target.value })}
              />
              <div className="flex gap-2">
                <select
                  className={field}
                  value={row.solverGuid}
                  onChange={(e) => updateRow(row.key, { solverGuid: e.target.value })}
                  aria-label={t("meetingTaskWho")}
                >
                  <option value="">{t("meetingTaskWho")}</option>
                  {team?.members.map((m) => (
                    <option key={m.guid} value={m.guid}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  className={field}
                  value={row.due}
                  onChange={(e) => updateRow(row.key, { due: e.target.value })}
                  aria-label={t("meetingTaskDue")}
                />
                <button
                  type="button"
                  onClick={() => removeRow(row.key)}
                  className="shrink-0 rounded-md border border-border px-3 text-sm text-muted-foreground hover:bg-muted"
                >
                  {t("meetingRemoveTask")}
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setRows((prev) => [...prev, blankRow()])}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            {t("meetingAddTask")}
          </button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {saved && (
          <p className="text-sm text-foreground">
            {t("meetingSaved")} — {t("meetingSavedTasks")}: {saved.tasks}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-primary px-4 py-2.5 font-medium text-white hover:bg-primary-light disabled:opacity-50"
        >
          {busy ? t("meetingSaving") : t("meetingSave")}
        </button>
      </form>
    </main>
  );
}
