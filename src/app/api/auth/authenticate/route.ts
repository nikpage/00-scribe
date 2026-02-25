import { NextResponse } from "next/server";
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createClient as createSSRClient } from "@/lib/supabase/server";

const rpID = process.env.WEBAUTHN_RP_ID!;
const origin = process.env.WEBAUTHN_ORIGIN!;

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const challenges = new Map<string, string>();

export async function POST(request: Request) {
  const body = await request.json();
  const { step, credential } = body;

  if (step === "options") {
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "preferred",
    });

    // Store challenge by a temp ID from the cookie or generate one
    const challengeId = crypto.randomUUID();
    challenges.set(challengeId, options.challenge);

    return NextResponse.json(options, {
      headers: {
        "Set-Cookie": `webauthn_challenge=${challengeId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=300`,
      },
    });
  }

  if (step === "verify") {
    const cookieStore = await cookies();
    const challengeId = cookieStore.get("webauthn_challenge")?.value;
    if (!challengeId) {
      return NextResponse.json({ error: "No challenge found" }, { status: 400 });
    }

    const expectedChallenge = challenges.get(challengeId);
    if (!expectedChallenge) {
      return NextResponse.json({ error: "Challenge expired" }, { status: 400 });
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
        expectedChallenge,
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

      // Create a Supabase session for this user
      // We use the admin client to generate a session token
      const { data: sessionData, error: sessionError } =
        await admin.auth.admin.generateLink({
          type: "magiclink",
          email: (
            await admin.auth.admin.getUserById(credData.user_id)
          ).data.user!.email!,
        });

      if (sessionError) {
        return NextResponse.json({ error: sessionError.message }, { status: 500 });
      }

      // Exchange the token hash for a session via the SSR client
      const supabase = await createSSRClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: sessionData.properties.hashed_token,
        type: "magiclink",
      });

      if (verifyError) {
        return NextResponse.json({ error: verifyError.message }, { status: 500 });
      }

      challenges.delete(challengeId);
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
