import { NextResponse } from "next/server";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createSSRClient } from "@/lib/supabase/server";

const rpID = process.env.WEBAUTHN_RP_ID!;
const rpName = process.env.WEBAUTHN_RP_NAME!;
const origin = process.env.WEBAUTHN_ORIGIN!;

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: Request) {
  const body = await request.json();
  const { step, name, email, credential, challenge: clientChallenge } = body;

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

    return NextResponse.json(options);
  }

  if (step === "verify") {
    if (!clientChallenge) {
      return NextResponse.json({ error: "No challenge provided" }, { status: 400 });
    }

    try {
      const verification = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge: clientChallenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
      });

      if (!verification.verified || !verification.registrationInfo) {
        return NextResponse.json({ error: "Verification failed" }, { status: 400 });
      }

      const { credential: cred } = verification.registrationInfo;
      const admin = getAdminClient();

      // Try to create user, or find existing one
      let userId: string;

      const { data: authData, error: authError } =
        await admin.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: { name },
        });

      if (authError) {
        // User already exists — find them and add the new passkey
        const { data: users } = await admin.auth.admin.listUsers();
        const existing = users?.users.find((u) => u.email === email);
        if (!existing) {
          return NextResponse.json({ error: authError.message }, { status: 400 });
        }
        userId = existing.id;

        // Ensure profile exists
        await admin.from("profiles").upsert({ id: userId, name });

        // Delete old credentials for this user (they don't work anymore)
        await admin.from("credentials").delete().eq("user_id", userId);
      } else {
        userId = authData.user.id;
        await admin.from("profiles").insert({ id: userId, name });
      }

      // Store new WebAuthn credential
      await admin.from("credentials").insert({
        id: cred.id,
        user_id: userId,
        public_key: Buffer.from(cred.publicKey).toString("base64"),
        counter: Number(cred.counter),
        transports: credential.response.transports ?? [],
      });

      // Auto-login
      const { data: sessionData, error: sessionError } =
        await admin.auth.admin.generateLink({
          type: "magiclink",
          email,
        });

      if (sessionError) {
        return NextResponse.json({ success: true, autoLogin: false });
      }

      const supabase = await createSSRClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: sessionData.properties.hashed_token,
        type: "magiclink",
      });

      if (verifyError) {
        return NextResponse.json({ success: true, autoLogin: false });
      }

      return NextResponse.json({ success: true, autoLogin: true });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Verification failed" },
        { status: 400 }
      );
    }
  }

  return NextResponse.json({ error: "Invalid step" }, { status: 400 });
}
