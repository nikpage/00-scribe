"use client";

import { useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";
import { useLang } from "@/hooks/use-lang";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { t } = useLang();

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // 1. Get registration options from server
      const optionsRes = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, step: "options" }),
      });
      if (!optionsRes.ok) {
        const data = await optionsRes.json();
        throw new Error(data.error || "Failed to get registration options");
      }
      const options = await optionsRes.json();

      // Save challenge — server is stateless on Vercel
      const challenge = options.challenge;

      // 2. Create credential with authenticator
      const credential = await startRegistration({ optionsJSON: options });

      // 3. Verify with server, passing challenge back
      const verifyRes = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, step: "verify", credential, challenge }),
      });
      if (!verifyRes.ok) {
        const data = await verifyRes.json();
        throw new Error(data.error || "Registration failed");
      }

      const result = await verifyRes.json();
      if (result.autoLogin) {
        router.push("/");
      } else {
        router.push("/auth/authenticate");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen p-4 pt-12">
      <div className="w-full max-w-sm mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">{t("appName")}</h1>
          <p className="mt-2 text-muted-foreground">{t("registerTitle")}</p>
        </div>
        <form onSubmit={handleRegister} className="space-y-4">
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
            placeholder={t("emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-white hover:bg-primary-light disabled:opacity-50"
          >
            {loading ? t("registering") : t("registerWithPasskey")}
          </button>
        </form>
        <div className="text-center">
          <a href="/auth/login" className="text-sm text-primary hover:underline">
            {t("alreadyHaveAccount")}
          </a>
        </div>
      </div>
    </div>
  );
}
