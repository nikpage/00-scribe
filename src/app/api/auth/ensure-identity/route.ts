import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST — called once from /setup right after the anonymous account + profile
// are created. Anonymous Supabase users have no email, but desktop phone
// login mints a session via generateLink(magiclink), which requires one.
// This gives the auth user a synthetic, never-emailed, pre-confirmed address
// so that path works later without ever sending mail or exposing the address
// to the worker.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (user.email) return NextResponse.json({ ok: true });

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    email: `${user.id}@phone.internal.scribe`,
    email_confirm: true,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
