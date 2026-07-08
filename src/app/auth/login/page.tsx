"use client";

import { useEffect, useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { setRememberDevice } from "@/lib/remember-device";
import { getPasskeyEnrolled, setPasskeyEnrolled } from "@/lib/passkey";
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
  const [rememberMe, setRememberMe] = useState(false);
  const [pwMode, setPwMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState<"passkey" | "phone" | "password" | "reset" | null>(null);
  // Only offer biometric sign-in on a device that actually enrolled a passkey,
  // so a fresh phone / empty database never surfaces stale OS credentials.
  const [passkeyEnrolled, setPasskeyEnrolledState] = useState(false);
  const router = useRouter();
  const { lang, switchLang, t } = useLang();
  const supabase = createClient();

  useEffect(() => {
    setPasskeyEnrolledState(getPasskeyEnrolled());
  }, []);

  // WebOTP: read the code straight from the incoming SMS and fill it in, with
  // no typing. Works because the SMS we send ends with "@<domain> #<code>".
  // Android Chrome auto-fills; iOS shows the code as a one-tap keyboard chip.
  useEffect(() => {
    if (mode !== "phone" || phoneStep !== "code") return;
    if (!("OTPCredential" in window)) return;

    const controller = new AbortController();
    navigator.credentials
      .get({
        // @ts-expect-error — OTPCredential isn't in TS's lib.dom yet
        otp: { transport: ["sms"] },
        signal: controller.signal,
      })
      .then((otp: unknown) => {
        const value = (otp as { code?: string } | null)?.code;
        if (value) setCode(value);
      })
      .catch(() => {});

    return () => controller.abort();
  }, [mode, phoneStep]);

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
      const message = err instanceof Error ? err.message : t("authFailed");
      // The server doesn't know this device credential (e.g. the account was
      // deleted) — stop offering biometric until it's re-enrolled.
      if (message === "Credential not found") {
        setPasskeyEnrolled(false);
        setPasskeyEnrolledState(false);
      }
      setError(message);
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
      if (!res.ok) throw new Error(res.status === 429 ? t("tooManyRequests") : data.error || t("authFailed"));

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
    setInfo("");
    setLoading("password");

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(t("invalidCredentials"));
      setLoading(null);
    } else {
      setRememberDevice(rememberMe);
      router.push("/");
    }
  }

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading("password");

    const res = await fetch("/api/auth/password/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(res.status === 409 ? t("accountExistsSignIn") : data.error || t("authFailed"));
      setLoading(null);
      return;
    }

    // Account created server-side with email confirmed — sign straight in.
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(t("authFailed"));
      setLoading(null);
      return;
    }
    setRememberDevice(rememberMe);
    router.push("/");
  }

  async function handleForgotPassword() {
    setError("");
    setInfo("");
    if (!email) {
      setError(t("enterEmailFirst"));
      return;
    }
    setLoading("reset");
    // Redirect through the auth callback so the recovery code is exchanged for
    // a session, then land the user on the set-new-password screen.
    const redirectTo = `${window.location.origin}/auth/callback?next=/auth/reset`;
    await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    setLoading(null);
    // Always show the same message whether or not the email exists — don't leak
    // which addresses have accounts.
    setInfo(t("resetEmailSent"));
  }

  return (
    <div className="min-h-screen p-4 pt-8">
      <div className="w-full max-w-sm mx-auto space-y-6">
        <div className="flex justify-end"><LangToggle lang={lang} onSwitch={switchLang} /></div>
        <h1 className="text-2xl font-bold text-center">{t("appName")}</h1>

        {/* Biometric — only on a device that has actually enrolled a passkey */}
        {passkeyEnrolled && (
          <>
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
          </>
        )}

        {mode === "phone" && phoneStep === "phone" && (
          <form onSubmit={handleSendCode} className="space-y-3">
            <input
              type="tel"
              autoComplete="tel"
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
                autoComplete="email"
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
              autoComplete="one-time-code"
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
          <form
            onSubmit={pwMode === "signup" ? handleCreateAccount : handlePasswordSignIn}
            className="space-y-3"
          >
            <input
              type="email"
              autoComplete="email"
              placeholder={t("yourEmail")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary"
            />
            <input
              type="password"
              autoComplete={pwMode === "signup" ? "new-password" : "current-password"}
              placeholder={t("yourPassword")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={pwMode === "signup" ? 8 : undefined}
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary"
            />
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              {t("rememberMe")}
            </label>
            <button
              type="submit"
              disabled={loading !== null}
              className="w-full rounded-lg border border-border bg-background px-4 py-3 font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              {pwMode === "signup"
                ? loading === "password"
                  ? t("creatingAccount")
                  : t("createAccount")
                : loading === "password"
                  ? t("signingIn")
                  : t("signIn")}
            </button>
            {pwMode === "signin" && (
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={loading !== null}
                className="w-full text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                {loading === "reset" ? t("sendingResetLink") : t("forgotPassword")}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setPwMode(pwMode === "signin" ? "signup" : "signin");
                setError("");
                setInfo("");
              }}
              disabled={loading !== null}
              className="w-full text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {pwMode === "signin" ? t("newHereCreate") : t("haveAccountSignIn")}
            </button>
          </form>
        )}

        {info && <p className="text-sm text-muted-foreground text-center">{info}</p>}

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
