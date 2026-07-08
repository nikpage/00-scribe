import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createSSRClient } from "@/lib/supabase/server";
import { checkPhoneVerification, toE164 } from "@/lib/vonage";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("Server misconfigured: NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!key) throw new Error("Server misconfigured: SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(url, key);
}

// Mints a session the same way passkey login does: an admin-generated
// magiclink, redeemed server-side. Every account keeps a real email so this
// stays a single code path regardless of which method the user signed in with.
async function establishSession(email: string) {
  const admin = getAdminClient();
  const { data: sessionData, error: sessionError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (sessionError) throw new Error(sessionError.message);

  const supabase = await createSSRClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: sessionData.properties.hashed_token,
    type: "magiclink",
  });
  if (verifyError) throw new Error(verifyError.message);
}

export async function POST(request: Request) {
  const { requestId, code, phone, email } = await request.json();
  if (!requestId || !code || !phone) {
    return NextResponse.json({ error: "Missing requestId, code, or phone" }, { status: 400 });
  }

  const normalized = toE164(phone);
  const ok = checkPhoneVerification(requestId, code, normalized);
  if (!ok) {
    return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 });
  }

  const admin = getAdminClient();
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("phone", normalized)
    .maybeSingle();

  try {
    if (existingProfile) {
      const { data: userData } = await admin.auth.admin.getUserById(existingProfile.id);
      if (!userData.user?.email) {
        return NextResponse.json({ error: "Account has no email on file" }, { status: 500 });
      }
      await establishSession(userData.user.email);
      return NextResponse.json({ success: true, isNewUser: false });
    }

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email required for new accounts" }, { status: 400 });
    }

    const { data: users } = await admin.auth.admin.listUsers();
    if (users?.users.some((u) => u.email === email)) {
      return NextResponse.json({ error: "Email already in use" }, { status: 400 });
    }

    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { phone: normalized },
    });
    if (authError || !authData.user) {
      return NextResponse.json(
        { error: authError?.message || "Failed to create account" },
        { status: 400 }
      );
    }

    await establishSession(email);
    return NextResponse.json({ success: true, isNewUser: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sign-in failed" },
      { status: 500 }
    );
  }
}
