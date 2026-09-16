"use client";

import { useEffect, useMemo, useState } from "react";
import { useLang } from "@/hooks/use-lang";
import { useEwayAttention } from "@/components/app-shell";
import { DEFAULT_TOPIC } from "@/lib/eway/teams";
import type { MeetingProject } from "@/lib/eway/projects";

// Meeting minutes. Deliberately off the main nav: most workers only ever
// record client visits, and only note-takers come here (by URL).
//
// One meeting, one parent project — but a meeting covers several projects, so
// the minutes are split into tabs, one per project discussed, each with its own
// notes and its own assignments. Everything still files under the parent
// project; the tab's project name is a label on the minutes and on each task.
//
// Nothing is transcribed or AI-extracted: the note-taker types, and picking the
// person from the parent project's own Tym *is* the assignment.
//
// Projects and their members come from eWay live (/api/eway/projects): the
// picker and the save therefore share one source of truth for who exists.

type Row = { key: number; solverGuid: string; text: string; start: string; due: string };
type Tab = { key: number; projectName: string; notes: string; rows: Row[] };

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
  return { key: nextKey++, solverGuid: "", text: "", start: today(), due: "" };
}
function blankTab(): Tab {
  return { key: nextKey++, projectName: "", notes: "", rows: [blankRow()] };
}

export default function MeetingPage() {
  const { t } = useLang();
  const ewayAttention = useEwayAttention();

  const [projects, setProjects] = useState<MeetingProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectName, setProjectName] = useState("");
  const [topic, setTopic] = useState(DEFAULT_TOPIC);
  const [date, setDate] = useState(today);
  const [tabs, setTabs] = useState<Tab[]>([blankTab()]);
  const [activeTab, setActiveTab] = useState(0);
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

  const tab = tabs[activeTab] ?? tabs[0];

  function updateTab(key: number, patch: Partial<Tab>) {
    setTabs((prev) => prev.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  }

  function removeTab(key: number) {
    setTabs((prev) => {
      const next = prev.length === 1 ? [blankTab()] : prev.filter((x) => x.key !== key);
      setActiveTab((i) => Math.min(i, next.length - 1));
      return next;
    });
  }

  function updateRow(tabKey: number, key: number, patch: Partial<Row>) {
    setTabs((prev) =>
      prev.map((x) =>
        x.key === tabKey
          ? { ...x, rows: x.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) }
          : x
      )
    );
  }

  function removeRow(tabKey: number, key: number) {
    setTabs((prev) =>
      prev.map((x) =>
        x.key === tabKey
          ? {
              ...x,
              rows: x.rows.length === 1 ? [blankRow()] : x.rows.filter((r) => r.key !== key),
            }
          : x
      )
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaved(null);

    // A tab nobody typed in is dropped rather than refused — the form starts
    // with one empty tab and note-takers add more than they end up using.
    const filledTabs = tabs
      .map((x) => ({ ...x, rows: x.rows.filter((r) => r.text.trim()) }))
      .filter((x) => x.notes.trim() || x.rows.length > 0);

    if (filledTabs.length === 0) {
      setError(t("meetingNothingToSave"));
      return;
    }
    if (filledTabs.some((x) => !x.projectName)) {
      setError(t("meetingTabNeedsProject"));
      return;
    }
    if (filledTabs.some((x) => x.rows.some((r) => !r.solverGuid))) {
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
          tabs: filledTabs.map((x) => ({
            projectName: x.projectName,
            notes: x.notes,
            assignments: x.rows.map((r) => ({
              solverGuid: r.solverGuid,
              text: r.text.trim(),
              start: r.start || null,
              due: r.due || null,
            })),
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
      setTabs([blankTab()]);
      setActiveTab(0);
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

        {/* All ~390 eWay projects are pickable, so the parent and each tab use a
            type-to-filter datalist rather than a select nobody can scroll. */}
        <datalist id="eway-projects">
          {projects.map((x) => (
            <option key={x.name} value={x.name} />
          ))}
        </datalist>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={label} htmlFor="project">
              {t("meetingProject")}
            </label>
            <input
              id="project"
              className={field}
              list="eway-projects"
              value={projectName}
              disabled={projectsLoading}
              placeholder={projectsLoading ? t("meetingProjectsLoading") : ""}
              onChange={(e) => setProjectName(e.target.value)}
            />
          </div>
          <div className="space-y-3">
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
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 border-b border-border">
            {tabs.map((x, i) => (
              <button
                key={x.key}
                type="button"
                onClick={() => setActiveTab(i)}
                className={`-mb-px rounded-t-md border border-b-0 px-3 py-1.5 text-sm ${
                  i === activeTab
                    ? "border-border bg-background font-medium"
                    : "border-transparent text-muted-foreground hover:bg-muted"
                }`}
              >
                {x.projectName || `${t("meetingTabProject")} ${i + 1}`}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setTabs((prev) => [...prev, blankTab()]);
                setActiveTab(tabs.length);
              }}
              className="-mb-px px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              + {t("meetingAddTab")}
            </button>
          </div>

          {tab && (
            <div className="space-y-4">
              <div>
                <label className={label} htmlFor={`tab-project-${tab.key}`}>
                  {t("meetingTabProject")}
                </label>
                <div className="flex gap-2">
                  <input
                    id={`tab-project-${tab.key}`}
                    className={field}
                    list="eway-projects"
                    value={tab.projectName}
                    onChange={(e) => updateTab(tab.key, { projectName: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => removeTab(tab.key)}
                    className="shrink-0 rounded-md border border-border px-3 text-sm text-muted-foreground hover:bg-muted"
                  >
                    {t("meetingRemoveTab")}
                  </button>
                </div>
              </div>

              <div>
                <label className={label} htmlFor={`notes-${tab.key}`}>
                  {t("meetingNotes")}
                </label>
                <textarea
                  id={`notes-${tab.key}`}
                  className={`${field} min-h-40`}
                  placeholder={t("meetingNotesPlaceholder")}
                  value={tab.notes}
                  onChange={(e) => updateTab(tab.key, { notes: e.target.value })}
                />
              </div>

              <div className="space-y-3">
                <div className={label}>{t("meetingTasks")}</div>
                {tab.rows.map((row) => (
                  <div key={row.key} className="space-y-2 rounded-lg border border-border p-3">
                    <input
                      className={field}
                      placeholder={t("meetingTaskWhat")}
                      value={row.text}
                      onChange={(e) => updateRow(tab.key, row.key, { text: e.target.value })}
                    />
                    <div className="flex gap-2">
                      <select
                        className={field}
                        value={row.solverGuid}
                        onChange={(e) =>
                          updateRow(tab.key, row.key, { solverGuid: e.target.value })
                        }
                        aria-label={t("meetingTaskWho")}
                      >
                        <option value="">{t("meetingTaskWho")}</option>
                        {project?.members.map((m) => (
                          <option key={m.guid} value={m.guid}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => removeRow(tab.key, row.key)}
                        className="shrink-0 rounded-md border border-border px-3 text-sm text-muted-foreground hover:bg-muted"
                      >
                        {t("meetingRemoveTask")}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={label} htmlFor={`start-${row.key}`}>
                          {t("meetingTaskStart")}
                        </label>
                        <input
                          id={`start-${row.key}`}
                          type="date"
                          className={field}
                          value={row.start}
                          onChange={(e) => updateRow(tab.key, row.key, { start: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className={label} htmlFor={`due-${row.key}`}>
                          {t("meetingTaskDue")}
                        </label>
                        <input
                          id={`due-${row.key}`}
                          type="date"
                          className={field}
                          value={row.due}
                          onChange={(e) => updateRow(tab.key, row.key, { due: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    updateTab(tab.key, { rows: [...tab.rows, blankRow()] })
                  }
                  className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
                >
                  {t("meetingAddTask")}
                </button>
              </div>
            </div>
          )}
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
