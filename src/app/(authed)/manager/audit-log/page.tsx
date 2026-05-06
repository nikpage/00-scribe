"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/hooks/use-lang";
import { useAppUser } from "@/components/app-shell";

interface AuditEvent {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  target_label: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const actionLabels: Record<string, string> = {
  view_client: "viewed client",
  edit_client: "edited client",
  create_client: "created client",
  view_recording: "viewed recording",
  edit_recording: "edited recording",
  view_needs_review: "opened needs-review queue",
  view_audit_log: "opened audit log",
  view_manager_dashboard: "opened manager dashboard",
};

export default function AuditLogPage() {
  const { lang, t } = useLang();
  const user = useAppUser();
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user.isManager) return;
    fetch("/api/manager/audit-log")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) {
          setError(data.error || "Failed to load");
          return;
        }
        setEvents(data.events || []);
      })
      .catch(() => setError("Failed to load"));
  }, [user.isManager]);

  if (!user.isManager) {
    return (
      <main className="p-6">
        <div className="text-center text-muted-foreground">
          <p className="text-lg font-medium">{t("accessDenied")}</p>
          <p className="mt-1">{t("needManager")}</p>
        </div>
      </main>
    );
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleString(lang === "cs" ? "cs-CZ" : "en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <main className="p-4 md:p-6">
      <div className="mb-6">
        <a href="/manager" className="text-sm text-primary hover:underline">
          ← {t("backToOverview")}
        </a>
        <h2 className="mt-2 text-2xl font-bold">{t("auditLog")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("auditLogDesc")}</p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {events === null ? (
        <div className="text-muted-foreground">{t("loading")}</div>
      ) : events.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">{t("noAuditEvents")}</div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                  {t("date")}
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                  {t("worker")}
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                  {t("actions")}
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                  Target
                </th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-xs text-muted-foreground">{formatTime(e.created_at)}</td>
                  <td className="px-4 py-3 text-sm">{e.actor_name || "—"}</td>
                  <td className="px-4 py-3 text-sm">{actionLabels[e.action] || e.action}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {e.target_label || (e.target_type === "system" ? "—" : e.target_type)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
