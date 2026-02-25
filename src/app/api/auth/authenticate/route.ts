import { NextResponse } from "next/server";
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createSSRClient } from "@/lib/supabase/server";

const rpID = process.env.WEBAUTHN_RP_ID!;
const origin = process.env.WEBAUTHN_ORIGIN!;

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: Request) {
  const body = await request.json();
  const { step, credential, challenge: clientChallenge } = body;

  if (step === "options") {
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "preferred",
    });

    // Return challenge to client — client sends it back in verify step
    return NextResponse.json(options);
  }

  if (step === "verify") {
    if (!clientChallenge) {
      return NextResponse.json({ error: "No challenge provided" }, { status: 400 });
    }

    try {
      const admin = getAdminClient();

      // Look up the credential
      const { data: credData } = await admin
        .from("credentials")
        .select("*")
        .eq("id", credential.id)
        .single();

      if (!credData) {
        return NextResponse.json({ error: "Credential not found" }, { status: 400 });
      }

      const verification = await verifyAuthenticationResponse({
        response: credential,
        expectedChallenge: clientChallenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        credential: {
          id: credData.id,
          publicKey: new Uint8Array(Buffer.from(credData.public_key, "base64")),
          counter: Number(credData.counter),
          transports: credData.transports,
        },
      });

      if (!verification.verified) {
        return NextResponse.json({ error: "Verification failed" }, { status: 400 });
      }

      // Update counter
      await admin
        .from("credentials")
        .update({ counter: Number(verification.authenticationInfo.newCounter) })
        .eq("id", credData.id);

      // Create a Supabase session
      const { data: userData } = await admin.auth.admin.getUserById(credData.user_id);
      if (!userData.user?.email) {
        return NextResponse.json({ error: "User not found" }, { status: 400 });
      }

      const { data: sessionData, error: sessionError } =
        await admin.auth.admin.generateLink({
          type: "magiclink",
          email: userData.user.email,
        });

      if (sessionError) {
        return NextResponse.json({ error: sessionError.message }, { status: 500 });
      }

      const supabase = await createSSRClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: sessionData.properties.hashed_token,
        type: "magiclink",
      });

      if (verifyError) {
        return NextResponse.json({ error: verifyError.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Authentication failed" },
        { status: 400 }
      );
    }
  }

  return NextResponse.json({ error: "Invalid step" }, { status: 400 });
}
