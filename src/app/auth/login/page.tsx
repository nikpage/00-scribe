"use client";

import { useState } from "react";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLang } from "@/hooks/use-lang";
import { LangToggle } from "@/components/lang-toggle";

export default function AuthPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [magicEmail, setMagicEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const router = useRouter();
  const { lang, switchLang, t } = useLang();
  const supabase = createClient();

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const optionsRes = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, step: "options" }),
      });
      if (!optionsRes.ok) {
        const data = await optionsRes.json();
        throw new Error(data.error || "Registration failed");
      }
      const options = await optionsRes.json();
      const challenge = options.challenge;

      const credential = await startRegistration({ optionsJSON: options });

      const verifyRes = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, step: "verify", credential, challenge }),
      });
      if (!verifyRes.ok) {
        const data = await verifyRes.json();
        throw new Error(data.error || "Registration failed");
      }

      router.push("/queue");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignIn() {
    setError("");
    setLoading(true);

    try {
      const optionsRes = await fetch("/api/auth/authenticate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "options" }),
      });
      if (!optionsRes.ok) throw new Error("Failed to get options");
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
        throw new Error(data.error || "Sign in failed");
      }

      router.push("/queue");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await supabase.auth.signInWithOtp({
      email: magicEmail,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (error) {
      setError(error.message);
    } else {
      setMagicSent(true);
    }
    setLoading(false);
  }

  if (magicSent) {
    return (
      <div className="min-h-screen p-4 pt-8">
        <div className="w-full max-w-sm mx-auto space-y-4 text-center">
          <div className="flex justify-end"><LangToggle lang={lang} onSwitch={switchLang} /></div>
          <h1 className="text-2xl font-bold">{t("appName")}</h1>
          <p className="text-muted-foreground">
            {t("magicLinkSent")} <strong>{magicEmail}</strong>
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

        {/* Register — first time */}
        <form onSubmit={handleRegister} className="space-y-3">
          <input
            type="text"
            placeholder={t("yourName")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary"
          />
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
            disabled={loading}
            className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-white hover:bg-primary-light disabled:opacity-50"
          >
            {loading ? t("registering") : t("registerButton")}
          </button>
        </form>

        {error && <p className="text-sm text-destructive text-center">{error}</p>}

        {/* Sign in — returning user */}
        <div className="relative flex items-center gap-3">
          <div className="flex-1 border-t border-border" />
          <span className="text-sm text-muted-foreground">{t("or")}</span>
          <div className="flex-1 border-t border-border" />
        </div>

        <button
          onClick={handleSignIn}
          disabled={loading}
          className="w-full rounded-lg border border-border bg-background px-4 py-3 font-medium text-foreground hover:bg-muted disabled:opacity-50"
        >
          {t("signInWithPasskey")}
        </button>

        {/* Magic link — works on any device */}
        <form onSubmit={handleMagicLink} className="space-y-3">
          <input
            type="email"
            placeholder={t("emailForMagicLink")}
            value={magicEmail}
            onChange={(e) => setMagicEmail(e.target.value)}
            required
            className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg border border-border bg-background px-4 py-3 font-medium text-foreground hover:bg-muted disabled:opacity-50"
          >
            {t("sendMagicLink")}
          </button>
        </form>
      </div>
    </div>
  );
}
