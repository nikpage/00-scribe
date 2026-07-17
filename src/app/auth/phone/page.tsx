"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLang } from "@/hooks/use-lang";
import { LangToggle } from "@/components/lang-toggle";

type Step = "phone" | "code";

export default function PhoneLoginPage() {
  const { lang, switchLang, t } = useLang();
  const router = useRouter();
  const supabase = createClient();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [requestId, setRequestId] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/phone/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t("authFailed"));
        return;
      }
      setRequestId(data.requestId);
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("authFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
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
        email: data.email,
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
          <h1 className="text-2xl font-bold">{t("appName")}</h1>
          <p className="mt-2 text-muted-foreground">{t("yourPhone")}</p>
        </div>

        {step === "phone" && (
          <form onSubmit={handleSendCode} className="space-y-4">
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
              {busy ? t("sendingCode") : t("sendCode")}
            </button>
          </form>
        )}

        {step === "code" && (
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <p className="text-sm text-muted-foreground">
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
