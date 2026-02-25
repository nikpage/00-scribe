import { NextResponse } from "next/server";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { createClient } from "@supabase/supabase-js";

const rpID = process.env.WEBAUTHN_RP_ID!;
const rpName = process.env.WEBAUTHN_RP_NAME!;
const origin = process.env.WEBAUTHN_ORIGIN!;

// Use service role client for user management
function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// In-memory challenge store (per-server; fine for single-instance POC)
const challenges = new Map<string, string>();

export async function POST(request: Request) {
  const body = await request.json();
  const { step, name, email, credential } = body;

  if (step === "options") {
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: email,
      userDisplayName: name,
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
    });

    challenges.set(email, options.challenge);
    return NextResponse.json(options);
  }

  if (step === "verify") {
    const expectedChallenge = challenges.get(email);
    if (!expectedChallenge) {
      return NextResponse.json({ error: "No challenge found" }, { status: 400 });
    }

    try {
      const verification = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
      });

      if (!verification.verified || !verification.registrationInfo) {
        return NextResponse.json({ error: "Verification failed" }, { status: 400 });
      }

      const { credential: cred } = verification.registrationInfo;

      // Create Supabase auth user
      const admin = getAdminClient();
      const { data: authData, error: authError } =
        await admin.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: { name },
        });

      if (authError) {
        return NextResponse.json({ error: authError.message }, { status: 400 });
      }

      const userId = authData.user.id;

      // Create profile
      await admin.from("profiles").insert({
        id: userId,
        name,
      });

      // Store WebAuthn credential
      await admin.from("credentials").insert({
        id: cred.id,
        user_id: userId,
        public_key: Buffer.from(cred.publicKey).toString("base64"),
        counter: Number(cred.counter),
        transports: credential.response.transports ?? [],
      });

      challenges.delete(email);
      return NextResponse.json({ success: true });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Verification failed" },
        { status: 400 }
      );
    }
  }

  return NextResponse.json({ error: "Invalid step" }, { status: 400 });
}
