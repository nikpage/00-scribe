// Fire-and-forget alerts to notify-hub (nikpage/app-hub's Cloudflare Worker),
// which fans out to Slack. Used for server-side failures — including ones the
// worker never sees in the UI — so problems surface immediately instead of
// being noticed only when a client complains.
//
// No-ops silently if NOTIFY_HUB_TOKEN isn't set (e.g. local dev) and never
// throws — a broken alert must never break the request it's reporting on.

const NOTIFY_HUB_URL = process.env.NOTIFY_HUB_URL ?? "https://notify-hub.ainikpage.workers.dev/notify";
const PROJECT = "scribe";

export function notify(status: "ok" | "warn" | "fail", message: string): void {
  const token = process.env.NOTIFY_HUB_TOKEN;
  if (!token) return;

  fetch(NOTIFY_HUB_URL, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ project: PROJECT, status, message }),
  }).catch((err) => {
    console.error("[notify] failed to reach notify-hub:", err instanceof Error ? err.message : err);
  });
}
