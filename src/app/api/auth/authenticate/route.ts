import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createSSRClient } from "@/lib/supabase/server";

// The challenge is minted server-side and stashed in an httpOnly cookie, then
// read back on verify. Trusting a challenge posted by the browser would let a
// caller pick their own — defeating the point of the challenge.
const CHALLENGE_COOKIE = "webauthn_auth_challenge";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("Server misconfigured: NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!key) throw new Error("Server misconfigured: SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(url, key);
}

function getWebAuthnParams(request: Request) {
  const originHeader = request.headers.get("origin");
  if (originHeader) {
    const url = new URL(originHeader);
    return { origin: originHeader, rpID: url.hostname };
  }
  return {
    origin: process.env.WEBAUTHN_ORIGIN!,
    rpID: process.env.WEBAUTHN_RP_ID!,
  };
}

export async function POST(request: Request) {
  const body = await request.json();
  const { step, credential } = body;
  const { origin, rpID } = getWebAuthnParams(request);
  const cookieStore = await cookies();

  if (step === "options") {
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "preferred",
    });

    // Remember the challenge server-side; verify reads it back from here.
    cookieStore.set(CHALLENGE_COOKIE, options.challenge, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 300,
    });

    return NextResponse.json(options);
  }

  if (step === "verify") {
    const expectedChallenge = cookieStore.get(CHALLENGE_COOKIE)?.value;
    if (!expectedChallenge) {
      return NextResponse.json(
        { error: "Challenge expired, please try again" },
        { status: 400 }
      );
    }
    // One-time use: clear it so a challenge can't be replayed.
    cookieStore.delete(CHALLENGE_COOKIE);

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
