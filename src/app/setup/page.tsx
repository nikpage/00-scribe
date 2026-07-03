"use client";

import { useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useLang } from "@/hooks/use-lang";
import { LangToggle } from "@/components/lang-toggle";

export default function SetupPage() {
  const { lang, switchLang, t } = useLang();
  const [step, setStep] = useState<"name" | "passkey" | "password">("name");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const supabase = createClient();
  const router = useRouter();

  function finishOnboarding() {
    router.push("/settings/eway?onboarding=1");
  }

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);

    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    finishOnboarding();
  }

  async function handleName(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const phone = (user.user_metadata as { phone?: string } | null)?.phone;
      await supabase.from("profiles").upsert({ id: user.id, name, ...(phone ? { phone } : {}) });
      setEmail(user.email ?? "");
    }

    setSaving(false);
    setStep("passkey");
  }

  async function handlePasskey() {
    setError("");
    setSaving(true);

    try {
      const optionsRes = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, step: "options" }),
      });
      if (!optionsRes.ok) {
        const data = await optionsRes.json();
        throw new Error(data.error || t("authFailed"));
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
        throw new Error(data.error || t("authFailed"));
      }

      setStep("password");
      setSaving(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("authFailed"));
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-end"><LangToggle lang={lang} onSwitch={switchLang} /></div>

        {step === "name" ? (
          <>
            <div className="text-center">
              <h1 className="text-2xl font-bold">{t("welcomeTitle")}</h1>
              <p className="mt-2 text-muted-foreground">{t("enterName")}</p>
            </div>
            <form onSubmit={handleName} className="space-y-4">
              <input
                type="text"
                placeholder={t("fullName")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary"
              />
              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-white hover:bg-primary-light disabled:opacity-50"
              >
                {saving ? t("saving") : t("continue")}
              </button>
            </form>
          </>
        ) : (
          <>
            <div className="text-center">
              <h1 className="text-2xl font-bold">{t("passkeyOfferTitle")}</h1>
              <p className="mt-2 text-muted-foreground">{t("passkeyOfferDesc")}</p>
            </div>
            <div className="space-y-3">
              <button
                onClick={handlePasskey}
                disabled={saving}
                className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-white hover:bg-primary-light disabled:opacity-50"
              >
                {saving ? t("registering") : t("registerWithPasskey")}
              </button>
              <button
                onClick={() => setStep("password")}
                disabled={saving}
                className="w-full rounded-lg border border-border bg-background px-4 py-3 font-medium text-foreground hover:bg-muted disabled:opacity-50"
              >
                {t("skipForNow")}
              </button>
            </div>
            {error && <p className="text-sm text-destructive text-center">{error}</p>}
          </>
        )}

        {step === "password" && (
          <>
            <div className="text-center">
              <h1 className="text-2xl font-bold">{t("setPasswordTitle")}</h1>
              <p className="mt-2 text-muted-foreground">{t("setPasswordDesc")}</p>
            </div>
            <form onSubmit={handleSetPassword} className="space-y-4">
              <input
                type="password"
                placeholder={t("yourPassword")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary"
              />
              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-white hover:bg-primary-light disabled:opacity-50"
              >
                {saving ? t("saving") : t("continue")}
              </button>
              <button
                type="button"
                onClick={finishOnboarding}
                disabled={saving}
                className="w-full rounded-lg border border-border bg-background px-4 py-3 font-medium text-foreground hover:bg-muted disabled:opacity-50"
              >
                {t("skipForNow")}
              </button>
            </form>
            {error && <p className="text-sm text-destructive text-center">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}
