import { createAdminClient } from "@/lib/supabase/admin";

export type AuditAction =
  | "view_client"
  | "edit_client"
  | "create_client"
  | "view_recording"
  | "edit_recording"
  | "view_needs_review"
  | "view_audit_log"
  | "view_manager_dashboard"
  | "eway_connect"
  | "eway_disconnect"
  | "eway_test"
  | "eway_journal_save";

export type AuditTargetType = "client" | "recording" | "worker" | "system";

interface AuditEntry {
  actorId: string;
  actorName?: string;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId?: string | null;
  targetLabel?: string | null;
  metadata?: Record<string, unknown> | null;
}

// Records an event in the audit log via the service-role admin client.
// Failures are swallowed and logged: audit must never block the action it
// describes (a viewer who can't be audited should still see the data; the
// alternative is denying access, which makes the system worse).
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("audit_log").insert({
      actor_id: entry.actorId,
      actor_name: entry.actorName ?? null,
      action: entry.action,
      target_type: entry.targetType,
      target_id: entry.targetId ?? null,
      target_label: entry.targetLabel ?? null,
      metadata: entry.metadata ?? null,
    });
  } catch (err) {
    console.error("[audit] failed to write event", entry.action, err);
  }
}
