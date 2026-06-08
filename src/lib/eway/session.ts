import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/eway/crypto";
import { ewayLogin } from "@/lib/eway/client";

export type SessionResult =
  | { ok: true; session: string; userId: string }
  | { ok: false; status: number; error: string };

// Log in to eWay using the currently signed-in worker's saved credentials and
// return a live session id. Shared by the contact-search and journal routes so
// the decrypt + login dance lives in one place.
export async function getEwaySessionForCurrentUser(): Promise<SessionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Unauthorized" };

  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("eway_credentials")
    .select("username, password_ciphertext, password_iv, password_tag")
    .eq("user_id", user.id)
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

  return { ok: true, session: login.sessionId, userId: user.id };
}
