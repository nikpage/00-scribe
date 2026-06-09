"use client";

import { useState, useEffect } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLang } from "@/hooks/use-lang";
import { LangToggle } from "@/components/lang-toggle";

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState<"passkey" | "magic" | null>(null);
  const [magicSent, setMagicSent] = useState(false);
  const router = useRouter();
  const { lang, switchLang, t } = useLang();
  const supabase = createClient();

  // `auto` = fired automatically on page load. The user didn't ask, and may
  // have no passkey on this device, so we stay silent on failure/cancel and
  // let them fall back to the magic link. A manual button press surfaces errors.
  async function signInWithPasskey(auto: boolean) {
    setError("");
    if (!auto) setLoading("passkey");

    try {
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
        const data = await verifyRes.json();
        throw new Error(data.error || t("authFailed"));
      }

      router.push("/queue");
    } catch (err) {
      if (!auto) setError(err instanceof Error ? err.message : t("authFailed"));
    } finally {
      if (!auto) setLoading(null);
    }
  }

  // Pop the passkey prompt by itself on load — single ceremony, no button tap.
  useEffect(() => {
    signInWithPasskey(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading("magic");

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (error) {
      setError(error.message);
      setLoading(null);
    } else {
      setMagicSent(true);
      setLoading(null);
    }
  }

  if (magicSent) {
    return (
      <div className="min-h-screen p-4 pt-8">
        <div className="w-full max-w-sm mx-auto space-y-4 text-center">
          <div className="flex justify-end"><LangToggle lang={lang} onSwitch={switchLang} /></div>
          <h1 className="text-2xl font-bold">{t("appName")}</h1>
          <p className="text-muted-foreground">
            {t("magicLinkSent")} <strong>{email}</strong>
          </p>
          <p className="text-sm text-muted-foreground">{t("clickEmailLink")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 pt-8">
      <div className="w-full max-w-sm mx-auto space-y-6">
        <div className="flex justify-end"><LangToggle lang={lang} onSwitch={switchLang} /></div>
        <h1 className="text-2xl font-bold text-center">{t("appName")}</h1>

        {/* Sign in — returning user with a passkey on this device */}
        <button
          onClick={() => signInWithPasskey(false)}
          disabled={loading !== null}
          className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-white hover:bg-primary-light disabled:opacity-50"
        >
          {loading === "passkey" ? t("authenticating") : t("signInWithPasskey")}
        </button>

        <div className="relative flex items-center gap-3">
          <div className="flex-1 border-t border-border" />
          <span className="text-sm text-muted-foreground">{t("or")}</span>
          <div className="flex-1 border-t border-border" />
        </div>

        {/* Magic link — signs up new users and signs in on any device */}
        <form onSubmit={handleMagicLink} className="space-y-3">
          <input
            type="email"
            placeholder={t("yourEmail")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={loading !== null}
            className="w-full rounded-lg border border-border bg-background px-4 py-3 font-medium text-foreground hover:bg-muted disabled:opacity-50"
          >
            {loading === "magic" ? t("registering") : t("sendMagicLink")}
          </button>
        </form>

        {error && <p className="text-sm text-destructive text-center">{error}</p>}
      </div>
    </div>
  );
}
