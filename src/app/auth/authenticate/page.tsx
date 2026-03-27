"use client";

import { useState, useEffect } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";
import { useLang } from "@/hooks/use-lang";

export default function AuthenticatePage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { t } = useLang();

  async function handleAuthenticate() {
    setError("");
    setLoading(true);

    try {
      // 1. Get authentication options
      const optionsRes = await fetch("/api/auth/authenticate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "options" }),
      });
      if (!optionsRes.ok) throw new Error("Failed to get options");
      const options = await optionsRes.json();

      // Save challenge — server is stateless on Vercel
      const challenge = options.challenge;

      // 2. Authenticate with passkey
      const credential = await startAuthentication({ optionsJSON: options });

      // 3. Verify with server, passing challenge back
      const verifyRes = await fetch("/api/auth/authenticate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "verify", credential, challenge }),
      });
      if (!verifyRes.ok) {
        const data = await verifyRes.json();
        throw new Error(data.error || "Authentication failed");
      }

      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    handleAuthenticate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4 text-center">
        <h1 className="text-2xl font-bold">{t("appName")}</h1>
        {loading && !error && (
          <p className="text-muted-foreground">{t("authenticating")}</p>
        )}
        {error && (
          <div className="space-y-4">
            <p className="text-sm text-destructive">{error}</p>
            <button
              onClick={handleAuthenticate}
              className="rounded-lg bg-primary px-6 py-3 font-medium text-white hover:bg-primary-light"
            >
              {t("tryAgain")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
