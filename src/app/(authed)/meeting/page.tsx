"use client";

import { useEffect, useMemo, useState } from "react";
import { useLang } from "@/hooks/use-lang";
import { useEwayAttention } from "@/components/app-shell";
import { DEFAULT_TOPIC } from "@/lib/eway/teams";
import type { MeetingProject } from "@/lib/eway/projects";

// Meeting minutes. Deliberately off the main nav: most workers only ever
// record client visits, and only note-takers come here (by URL).
//
// The whole screen is one form — project, topic, date, minutes, and a row per
// assignment. Nothing is transcribed or AI-extracted: the note-taker types,
// and picking the person from the project's own Tym *is* the assignment.
//
// Projects and their members come from eWay live (/api/eway/projects): the
// picker and the save therefore share one source of truth for who exists.

type Row = { key: number; solverGuid: string; text: string; due: string };

const LAST_PROJECT_KEY = "scribe.meeting.lastProject";

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

  const [projects, setProjects] = useState<MeetingProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectName, setProjectName] = useState("");
  const [topic, setTopic] = useState(DEFAULT_TOPIC);
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<Row[]>([blankRow()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<{ tasks: number } | null>(null);

  // Load the projects and their Tym members, then select the one this
  // note-taker used last — they almost always write for the same meeting.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/eway/projects");
        if (res.status === 404) {
          ewayAttention.flag();
          if (!cancelled) setError(t("ewayNotConnectedHint"));
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (!cancelled) setError(data.error || t("meetingProjectsFailed"));
          return;
        }
        if (cancelled) return;
        const list: MeetingProject[] = Array.isArray(data.projects) ? data.projects : [];
        setProjects(list);
        const last = localStorage.getItem(LAST_PROJECT_KEY);
        const usable = list.filter((p) => p.guid);
        const pick = usable.find((p) => p.name === last) ?? usable[0];
        if (pick) setProjectName(pick.name);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t("meetingProjectsFailed"));
      } finally {
        if (!cancelled) setProjectsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const project = useMemo(
    () => projects.find((x) => x.name === projectName),
    [projects, projectName]
  );

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
          teamId: projectName,
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
        // Show eWay's own reason for each task it refused — the summary alone
        // ("1 task didn't save") isn't enough to fix anything.
        const failures: string[] = Array.isArray(data.tasks)
          ? data.tasks
              .filter((x: { ok?: boolean }) => x && x.ok === false)
              .map((x: { text?: string; error?: string }) => `${x.text}: ${x.error ?? "?"}`)
          : [];
        setError([data.error || t("meetingSaveFailed"), ...failures].join(" — "));
        return;
      }
      localStorage.setItem(LAST_PROJECT_KEY, projectName);
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
            <label className={label} htmlFor="project">
              {t("meetingProject")}
            </label>
            <select
              id="project"
              className={field}
              value={projectName}
              disabled={projectsLoading}
              onChange={(e) => setProjectName(e.target.value)}
            >
              {projectsLoading && <option value="">{t("meetingProjectsLoading")}</option>}
              {projects.map((x) => (
                // A name with no matching eWay project stays visible but
                // unpickable — never silently filed against a different one.
                <option key={x.name} value={x.name} disabled={!x.guid}>
                  {x.guid ? x.name : `${x.name} — ${t("meetingProjectMissing")}`}
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
                  {project?.members.map((m) => (
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
