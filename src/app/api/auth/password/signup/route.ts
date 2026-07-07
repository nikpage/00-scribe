import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Email + password account creation — the onboarding path that does NOT depend
// on SMS/Vonage. Uses the admin client with email_confirm so the account is
// immediately usable; the client then signs in with the same password.
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("Server misconfigured: NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!key) throw new Error("Server misconfigured: SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(url, key);
}

export async function POST(request: Request) {
  const { email, password } = await request.json();

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }
  if (!password || typeof password !== "string" || password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  const admin = getAdminClient();

  // Don't create a duplicate — tell the caller to sign in instead.
  const { data: users } = await admin.auth.admin.listUsers();
  if (users?.users.some((u) => u.email?.toLowerCase() === email.toLowerCase())) {
    return NextResponse.json({ error: "An account with that email already exists" }, { status: 409 });
  }

  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 400 });
  }

  // No profile row yet on purpose — the (authed) gate routes the new user
  // through /setup to collect their name, same as the phone-signup path.
  return NextResponse.json({ success: true });
}
