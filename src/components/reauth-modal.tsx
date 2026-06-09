"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startAuthentication } from "@simplewebauthn/browser";
import { createClient } from "@/lib/supabase/client";
import { useLang } from "@/hooks/use-lang";

const MAX_ATTEMPTS = 3;

export function ReauthModal({
  open,
  onSuccess,
}: {
  open: boolean;
  onSuccess: () => void;
}) {
  const { t } = useLang();
  const router = useRouter();
  const supabase = createClient();
  const [verifying, setVerifying] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState("");

  async function logoutAndRedirect() {
    await supabase.auth.signOut();
    router.replace("/auth/login");
  }

  async function runCeremony() {
    const optionsRes = await fetch("/api/auth/authenticate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: "options" }),
    });
    if (!optionsRes.ok) throw new Error(t("authFailed"));
    const options = await optionsRes.json();
    const challenge = options.challenge;

    const credential = await startAuthentication({ optionsJSON: options });

    const verifyRes = await fetch("/api/auth/authenticate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: "verify", credential, challenge }),
    });
    if (!verifyRes.ok) {
      const data = await verifyRes.json().catch(() => ({}));
      throw new Error(data.error || t("authFailed"));
    }
  }

  async function verify() {
    setVerifying(true);
    setError("");
    try {
      // Android's Credential Manager throws "unknown error" on the first call
      // after the app has been idle — it isn't awake yet. The retry succeeds
      // because the subsystem is now warm. Only a genuine double-failure counts
      // toward the lockout, so a transient glitch can't log the user out.
      try {
        await runCeremony();
      } catch {
        await new Promise((r) => setTimeout(r, 300));
        await runCeremony();
      }

      onSuccess();
      setAttempts(0);
    } catch (err) {
      const next = attempts + 1;
      setAttempts(next);
      setError(err instanceof Error ? err.message : t("authFailed"));
      if (next >= MAX_ATTEMPTS) {
        await logoutAndRedirect();
      }
    } finally {
      setVerifying(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-lg border border-border bg-background p-6 shadow-lg">
        <h2 className="text-lg font-bold">{t("sessionLocked")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("sessionLockedDesc")}</p>

        {error && (
          <p className="mt-3 text-sm text-destructive">{error}</p>
        )}

        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={verify}
            disabled={verifying}
            className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-white hover:bg-primary-light disabled:opacity-50"
          >
            {verifying ? t("authenticating") : t("unlockWithPasskey")}
          </button>
          <button
            onClick={logoutAndRedirect}
            className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium hover:bg-muted"
          >
            {t("logout")}
          </button>
        </div>
      </div>
    </div>
  );
}
