"use client";

import { useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLang } from "@/hooks/use-lang";
import { LangToggle } from "@/components/lang-toggle";

type PhoneStep = "phone" | "code";
type Mode = "phone" | "password";

// Local Czech numbers are typed without a country code; default to it so
// users don't have to know/type "+420" themselves.
function normalizePhoneInput(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.startsWith("420")) return digits;
  return `420${digits}`;
}

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>("phone");
  const [phoneStep, setPhoneStep] = useState<PhoneStep>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isNewUser, setIsNewUser] = useState(false);
  const [requestId, setRequestId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState<"passkey" | "phone" | "password" | null>(null);
  const router = useRouter();
  const { lang, switchLang, t } = useLang();
  const supabase = createClient();

  async function signInWithPasskey() {
    setError("");
    setLoading("passkey");

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
      setError(err instanceof Error ? err.message : t("authFailed"));
    } finally {
      setLoading(null);
    }
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading("phone");

    try {
      const normalized = normalizePhoneInput(phone);
      const res = await fetch("/api/auth/phone/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalized }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("authFailed"));

      setRequestId(data.requestId);
      setIsNewUser(data.isNewUser);
      setPhoneStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("authFailed"));
    } finally {
      setLoading(null);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading("phone");

    try {
      const normalized = normalizePhoneInput(phone);
      const res = await fetch("/api/auth/phone/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          code,
          phone: normalized,
          ...(isNewUser ? { email } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("invalidCode"));

      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("invalidCode"));
    } finally {
      setLoading(null);
    }
  }

  async function handlePasswordSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading("password");

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(t("invalidCredentials"));
      setLoading(null);
    } else {
      router.push("/");
    }
  }

  return (
    <div className="min-h-screen p-4 pt-8">
      <div className="w-full max-w-sm mx-auto space-y-6">
        <div className="flex justify-end"><LangToggle lang={lang} onSwitch={switchLang} /></div>
        <h1 className="text-2xl font-bold text-center">{t("appName")}</h1>

        {/* Passkey — fast path for returning users on this device */}
        <button
          onClick={signInWithPasskey}
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

        {mode === "phone" && phoneStep === "phone" && (
          <form onSubmit={handleSendCode} className="space-y-3">
            <input
              type="tel"
              placeholder={t("yourPhone")}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={loading !== null}
              className="w-full rounded-lg border border-border bg-background px-4 py-3 font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              {loading === "phone" ? t("sendingCode") : t("sendCode")}
            </button>
          </form>
        )}

        {mode === "phone" && phoneStep === "code" && (
          <form onSubmit={handleVerifyCode} className="space-y-3">
            <p className="text-sm text-muted-foreground text-center">
              {t("codeSentTo")} {phone}
            </p>
            {isNewUser && (
              <input
                type="email"
                placeholder={t("emailForNewAccount")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary"
              />
            )}
            <input
              type="text"
              inputMode="numeric"
              placeholder={t("enterCode")}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={loading !== null}
              className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-white hover:bg-primary-light disabled:opacity-50"
            >
              {loading === "phone" ? t("verifyingCode") : t("verifyCode")}
            </button>
            <button
              type="button"
              onClick={() => {
                setPhoneStep("phone");
                setCode("");
                setError("");
              }}
              className="w-full text-sm text-muted-foreground hover:text-foreground"
            >
              {t("changeNumber")}
            </button>
          </form>
        )}

        {mode === "password" && (
          <form onSubmit={handlePasswordSignIn} className="space-y-3">
            <input
              type="email"
              placeholder={t("yourEmail")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary"
            />
            <input
              type="password"
              placeholder={t("yourPassword")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={loading !== null}
              className="w-full rounded-lg border border-border bg-background px-4 py-3 font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              {loading === "password" ? t("signingIn") : t("signIn")}
            </button>
          </form>
        )}

        <button
          type="button"
          onClick={() => {
            setMode(mode === "phone" ? "password" : "phone");
            setPhoneStep("phone");
            setError("");
          }}
          className="w-full text-sm text-muted-foreground hover:text-foreground text-center"
        >
          {mode === "phone" ? t("useEmailPassword") : t("signInWithPhone")}
        </button>

        {error && <p className="text-sm text-destructive text-center">{error}</p>}
      </div>
    </div>
  );
}
