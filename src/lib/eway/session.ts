import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/eway/crypto";
import { ewayLogin, EwaySessionInvalidError } from "@/lib/eway/client";

export type SessionResult =
  | { ok: true; session: string; userId: string }
  | { ok: false; status: number; error: string };

// eWay caps concurrent sessions per account, and nothing ever logs a session
// off — so we must not open a fresh one on every request. Cache the live
// sessionId per worker (module-level, like the client-list cache in
// contacts/route.ts) and only log in again when there's no cached entry or
// the cached one turns out to be stale (see callEwayWithSessionRetry below).
const sessionCache = new Map<string, string>();

export function invalidateEwaySession(userId: string): void {
  sessionCache.delete(userId);
}

// Decrypt the worker's saved credentials and log in fresh, caching the
// resulting session. Shared by the cold-start path and the forced-refresh
// path (after a cached session turns out to be expired).
async function loginFreshForUser(userId: string): Promise<SessionResult> {
  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("eway_credentials")
    .select("username, password_ciphertext, password_iv, password_tag")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return { ok: false, status: 500, error: error.message };
  if (!row) {
    return { ok: false, status: 404, error: "No eWay account connected. Connect one in settings first." };
  }

  let password: string;
  try {
    password = decryptSecret({
      ciphertext: row.password_ciphertext,
      iv: row.password_iv,
      tag: row.password_tag,
    });
  } catch {
    return { ok: false, status: 500, error: "Could not read stored eWay password." };
  }

  let login;
  try {
    login = await ewayLogin(row.username, password);
  } catch (err) {
    return { ok: false, status: 502, error: err instanceof Error ? err.message : "eWay login failed" };
  }
  if (!login.ok || !login.sessionId) {
    return { ok: false, status: 502, error: login.description ?? login.returnCode };
  }

  sessionCache.set(userId, login.sessionId);
  return { ok: true, session: login.sessionId, userId };
}

// Return a live eWay session id for the currently signed-in worker, reusing
// the cached session instead of logging in again on every call.
export async function getEwaySessionForCurrentUser(): Promise<SessionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Unauthorized" };

  const cached = sessionCache.get(user.id);
  if (cached) return { ok: true, session: cached, userId: user.id };

  return loginFreshForUser(user.id);
}

// A cached session can go stale server-side (eWay expires idle sessions) even
// though nothing here evicted it. Run an eWay operation with the current
// session; if it throws because the session is no longer valid, evict the
// cache, log in once more, and retry with the fresh session — so callers
// never have to surface the stale-session error to the worker themselves.
export async function callEwayWithSessionRetry<T>(
  sess: { userId: string; session: string },
  run: (session: string) => Promise<T>
): Promise<T> {
  try {
    return await run(sess.session);
  } catch (err) {
    if (!(err instanceof EwaySessionInvalidError)) throw err;
    invalidateEwaySession(sess.userId);
    const fresh = await loginFreshForUser(sess.userId);
    if (!fresh.ok) throw err;
    return run(fresh.session);
  }
}
