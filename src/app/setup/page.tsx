"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useLang } from "@/hooks/use-lang";
import { LangToggle } from "@/components/lang-toggle";
import { normalizePhoneE164 } from "@/lib/phone";

// Single phone-first entry point for both new and returning workers:
//   1. Enter phone -> we look it up.
//   2. New number -> ask for a name, create the account, no OTP needed.
//   3. Existing number -> send an OTP and sign back into that same account
//      (this is the only path that ever needs a code — a device that
//      already has a session never reaches this page at all).
type Step = "phone" | "name" | "code";

export default function SetupPage() {
  const { lang, switchLang, t } = useLang();
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [requestId, setRequestId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handlePhoneSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const lookupRes = await fetch("/api/auth/phone/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const lookup = await lookupRes.json();
      if (!lookupRes.ok) {
        setError(lookup.error || t("authFailed"));
        return;
      }

      if (!lookup.exists) {
        setStep("name");
        return;
      }

      const startRes = await fetch("/api/auth/phone/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const start = await startRes.json();
      if (!startRes.ok) {
        setError(start.error || t("authFailed"));
        return;
      }
      setRequestId(start.requestId);
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("authFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleNameSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);

    // New number: create a fresh anonymous account for this device (or reuse
    // one already present) and attach name + phone. No OTP — nothing to
    // verify yet, this number has no account to protect.
    let {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const { data, error: signInError } = await supabase.auth.signInAnonymously();
      if (signInError || !data.user) {
        setBusy(false);
        setError(signInError?.message || t("authFailed"));
        return;
      }
      user = data.user;
    }

    const { error: upsertError } = await supabase
      .from("profiles")
      .upsert({ id: user.id, name, phone: normalizePhoneE164(phone) });

    if (upsertError) {
      setBusy(false);
      setError(upsertError.message);
      return;
    }

    // Best-effort: gives this auth user a synthetic email so a future
    // desktop login can mint a session for this exact account. Not fatal —
    // the worker just won't be able to log in on a second device yet.
    await fetch("/api/auth/ensure-identity", { method: "POST" }).catch(() => {});

    setBusy(false);
    router.push("/settings/eway?onboarding=1");
  }

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/phone/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, requestId, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t("invalidCode"));
        return;
      }
      const { error: verifyErr } = await supabase.auth.verifyOtp({
        token_hash: data.tokenHash,
        type: "magiclink",
      });
      if (verifyErr) {
        setError(verifyErr.message);
        return;
      }
      router.push("/queue");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("authFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-end">
          <LangToggle lang={lang} onSwitch={switchLang} />
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-bold">{t("welcomeTitle")}</h1>
          <p className="mt-2 text-muted-foreground">
            {step === "name" ? t("enterName") : t("yourPhone")}
          </p>
        </div>

        {step === "phone" && (
          <form onSubmit={handlePhoneSubmit} className="space-y-4">
            <input
              type="tel"
              autoComplete="tel"
              placeholder={t("yourPhone")}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              autoFocus
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={busy || !phone.trim()}
              className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-white hover:bg-primary-light disabled:opacity-50"
            >
              {busy ? t("saving") : t("continue")}
            </button>
          </form>
        )}

        {step === "name" && (
          <form onSubmit={handleNameSubmit} className="space-y-4">
            <input
              type="text"
              autoComplete="name"
              placeholder={t("fullName")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-white hover:bg-primary-light disabled:opacity-50"
            >
              {busy ? t("saving") : t("continue")}
            </button>
          </form>
        )}

        {step === "code" && (
          <form onSubmit={handleCodeSubmit} className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              {t("codeSentTo")} {phone}
            </p>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder={t("enterCode")}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              autoFocus
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={busy || !code.trim()}
              className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-white hover:bg-primary-light disabled:opacity-50"
            >
              {busy ? t("verifyingCode") : t("verifyCode")}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("phone");
                setCode("");
                setError("");
              }}
              className="w-full text-sm text-muted-foreground hover:underline"
            >
              {t("changeNumber")}
            </button>
          </form>
        )}

        {error && <p className="text-sm text-destructive text-center">{error}</p>}
      </div>
    </div>
  );
}
