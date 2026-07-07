// Tracks whether THIS device has a passkey enrolled for the app. The browser
// can't ask "does a passkey exist for this site" (privacy), so we record it
// ourselves at registration time and only offer biometric sign-in when it's set.
// Cleared if the server ever rejects a passkey as unknown (e.g. the account was
// deleted), so a stale device credential stops being offered.
const KEY = "scribe:passkeyEnrolled";

export function setPasskeyEnrolled(on: boolean): void {
  if (typeof window === "undefined") return;
  if (on) window.localStorage.setItem(KEY, "1");
  else window.localStorage.removeItem(KEY);
}

export function getPasskeyEnrolled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(KEY) === "1";
}
