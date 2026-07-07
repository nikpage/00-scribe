// "Keep me signed in on this device" preference. When set, AppShell skips the
// idle auto-lock so a worker on their own phone isn't forced to re-authenticate.
// Stored in localStorage (per-device, per-browser) — never leaves the client.
const KEY = "scribe:rememberDevice";

export function setRememberDevice(on: boolean): void {
  if (typeof window === "undefined") return;
  if (on) window.localStorage.setItem(KEY, "1");
  else window.localStorage.removeItem(KEY);
}

export function getRememberDevice(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(KEY) === "1";
}
