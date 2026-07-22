import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret } from "@/lib/eway/crypto";
import { ewayLogin } from "@/lib/eway/client";
import { invalidateEwaySession } from "@/lib/eway/session";
import { logAudit } from "@/lib/audit";

// GET — return the saved eWay connection for the current worker (no secrets).
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data } = await admin
    .from("eway_credentials")
    .select("username, last_verified_at, last_verified_ok, last_verified_error, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({ credentials: data ?? null });
}

// POST — save (or replace) the worker's eWay credentials. We test the login
// against eWay before persisting so a worker can never save credentials we
// haven't proven work; if eWay rejects them the row is not touched.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { username, password } = await request.json();
  if (typeof username !== "string" || !username.trim()) {
    return NextResponse.json({ error: "Missing username" }, { status: 400 });
  }
  if (typeof password !== "string" || !password) {
    return NextResponse.json({ error: "Missing password" }, { status: 400 });
  }

  let result;
  try {
    result = await ewayLogin(username.trim(), password);
  } catch (err) {
    const message = err instanceof Error ? err.message : "eWay request failed";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }

  if (!result.ok) {
    // Surface which eWay server we actually tried, so a wrong EWAY_SERVICE_URL
    // (right password, wrong database) is distinguishable from a real bad login.
    const host = (process.env.EWAY_SERVICE_URL ?? "")
      .replace(/^https?:\/\//, "")
      .replace(/\/+$/, "");
    return NextResponse.json(
      {
        ok: false,
        returnCode: result.returnCode,
        description: result.description
          ? `${result.description} [${result.returnCode}] · server: ${host || "(EWAY_SERVICE_URL not set)"}`
          : `${result.returnCode} · server: ${host || "(EWAY_SERVICE_URL not set)"}`,
        host,
      },
      { status: 400 }
    );
  }

  let encrypted;
  try {
    encrypted = encryptSecret(password);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Could not encrypt password" },
      { status: 500 }
    );
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("eway_credentials")
    .upsert({
      user_id: user.id,
      username: username.trim(),
      password_ciphertext: encrypted.ciphertext,
      password_iv: encrypted.iv,
      password_tag: encrypted.tag,
      last_verified_at: new Date().toISOString(),
      last_verified_ok: true,
      last_verified_error: null,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Credentials changed — a session cached under the old password must not
  // keep being reused.
  invalidateEwaySession(user.id);

  await logAudit({
    actorId: user.id,
    action: "eway_connect",
    targetType: "system",
    metadata: { username: username.trim() },
  });

  return NextResponse.json({ ok: true });
}

// DELETE — disconnect the worker's eWay account.
export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("eway_credentials")
    .delete()
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  invalidateEwaySession(user.id);

  await logAudit({
    actorId: user.id,
    action: "eway_disconnect",
    targetType: "system",
  });

  return NextResponse.json({ ok: true });
}
