import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/eway/crypto";
import { ewayLogin } from "@/lib/eway/client";
import { logAudit } from "@/lib/audit";

// POST /api/eway/test — re-verify the worker's saved eWay credentials.
// We log in fresh against eWay and update last_verified_* so the settings
// screen can show whether the connection is currently live.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: row, error: fetchErr } = await admin
    .from("eway_credentials")
    .select("username, password_ciphertext, password_iv, password_tag")
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Not connected" }, { status: 404 });

  let password: string;
  try {
    password = decryptSecret({
      ciphertext: row.password_ciphertext,
      iv: row.password_iv,
      tag: row.password_tag,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Decryption failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  let result;
  try {
    result = await ewayLogin(row.username, password);
  } catch (err) {
    const message = err instanceof Error ? err.message : "eWay request failed";
    await admin
      .from("eway_credentials")
      .update({
        last_verified_at: new Date().toISOString(),
        last_verified_ok: false,
        last_verified_error: message,
      })
      .eq("user_id", user.id);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }

  await admin
    .from("eway_credentials")
    .update({
      last_verified_at: new Date().toISOString(),
      last_verified_ok: result.ok,
      last_verified_error: result.ok ? null : result.description ?? result.returnCode,
    })
    .eq("user_id", user.id);

  await logAudit({
    actorId: user.id,
    action: "eway_test",
    targetType: "system",
    metadata: { ok: result.ok, returnCode: result.returnCode },
  });

  return NextResponse.json({
    ok: result.ok,
    returnCode: result.returnCode,
    description: result.description,
  });
}
