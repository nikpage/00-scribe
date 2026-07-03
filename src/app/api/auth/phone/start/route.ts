import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { startPhoneVerification, toE164 } from "@/lib/vonage";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("Server misconfigured: NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!key) throw new Error("Server misconfigured: SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(url, key);
}

export async function POST(request: Request) {
  const { phone } = await request.json();
  if (!phone || typeof phone !== "string") {
    return NextResponse.json({ error: "Phone number required" }, { status: 400 });
  }

  let normalized: string;
  try {
    normalized = toE164(phone);
  } catch {
    return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
  }

  const admin = getAdminClient();
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("phone", normalized)
    .maybeSingle();

  try {
    const requestId = await startPhoneVerification(normalized);
    return NextResponse.json({ requestId, isNewUser: !existing });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send code" },
      { status: 500 }
    );
  }
}
