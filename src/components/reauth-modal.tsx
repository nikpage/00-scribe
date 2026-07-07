"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startAuthentication } from "@simplewebauthn/browser";
import { createClient } from "@/lib/supabase/client";
import { useAppUser } from "@/components/app-shell";
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
  const user = useAppUser();
  const [verifying, setVerifying] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"passkey" | "password">("passkey");
  const [password, setPassword] = useState("");

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
      await registerFailure(err instanceof Error ? err.message : t("authFailed"));
    } finally {
      setVerifying(false);
    }
  }

  // Password unlock for workers who never set up fingerprint/face — otherwise
  // the lock screen would trap them with no way back in but logging out.
  async function verifyPassword(e: React.FormEvent) {
    e.preventDefault();
    setVerifying(true);
    setError("");
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: user.email,
        password,
      });
      if (error) {
        await registerFailure(t("invalidCredentials"));
        return;
      }
      setPassword("");
      onSuccess();
      setAttempts(0);
    } finally {
      setVerifying(false);
    }
  }

  async function registerFailure(message: string) {
    const next = attempts + 1;
    setAttempts(next);
    setError(message);
    if (next >= MAX_ATTEMPTS) {
      await logoutAndRedirect();
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
          {mode === "passkey" ? (
            <>
              <button
                onClick={verify}
                disabled={verifying}
                className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-white hover:bg-primary-light disabled:opacity-50"
              >
                {verifying ? t("authenticating") : t("unlockWithPasskey")}
              </button>
              <button
                onClick={() => {
                  setMode("password");
                  setError("");
                }}
                disabled={verifying}
                className="w-full text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                {t("usePasswordInstead")}
              </button>
            </>
          ) : (
            <form onSubmit={verifyPassword} className="flex flex-col gap-2">
              <input
                type="password"
                autoComplete="current-password"
                placeholder={t("yourPassword")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary"
              />
              <button
                type="submit"
                disabled={verifying}
                className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-white hover:bg-primary-light disabled:opacity-50"
              >
                {verifying ? t("signingIn") : t("unlock")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("passkey");
                  setError("");
                }}
                disabled={verifying}
                className="w-full text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                {t("unlockWithPasskey")}
              </button>
            </form>
          )}
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
