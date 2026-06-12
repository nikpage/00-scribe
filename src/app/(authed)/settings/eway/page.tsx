"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLang } from "@/hooks/use-lang";
import { useEwayAttention } from "@/components/app-shell";

type Connection = {
  username: string;
  last_verified_at: string | null;
  last_verified_ok: boolean | null;
  last_verified_error: string | null;
  updated_at: string;
};

function EwaySettings() {
  const { lang, t } = useLang();
  const router = useRouter();
  const onboarding = useSearchParams().get("onboarding") === "1";
  const ewayAttention = useEwayAttention();
  const [connection, setConnection] = useState<Connection | null | undefined>(undefined);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function refresh() {
    const res = await fetch("/api/eway/credentials");
    if (!res.ok) {
      setConnection(null);
      return;
    }
    const data = await res.json();
    setConnection(data.credentials ?? null);
  }

  useEffect(() => {
    refresh();
    // Landing on the connect screen answers the nav blink — turn it off.
    ewayAttention.clear();
  }, []);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const res = await fetch("/api/eway/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.description || data.error || data.returnCode || t("ewayConnectFailed"));
        return;
      }
      setPassword("");
      setInfo(t("ewayConnected"));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("ewayConnectFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleTest() {
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const res = await fetch("/api/eway/test", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.description || data.error || data.returnCode || t("ewayTestFailed"));
      } else {
        setInfo(t("ewayTestOk"));
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("ewayTestFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm(t("ewayDisconnectConfirm"))) return;
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const res = await fetch("/api/eway/credentials", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || t("ewayDisconnectFailed"));
        return;
      }
      setInfo(t("ewayDisconnected"));
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const verifiedDate = connection?.last_verified_at
    ? new Date(connection.last_verified_at).toLocaleString(lang === "cs" ? "cs-CZ" : "en-US")
    : null;

  return (
    <main className="p-4 md:p-6">
      <div className="mx-auto w-full max-w-md space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t("ewayConnectTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("ewayConnectDesc")}</p>
        </div>

        {onboarding && (
          <p className="rounded-lg border border-border bg-muted p-3 text-sm">
            {t("ewayOnboardingDesc")}
          </p>
        )}

        {connection === undefined && (
          <div className="text-muted-foreground">{t("loading")}</div>
        )}

        {connection && (
          <div className="space-y-3 rounded-lg border border-border bg-background p-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("ewayConnectedAs")}
              </div>
              <div className="font-medium">{connection.username}</div>
            </div>

            {verifiedDate && (
              <div className="text-sm">
                <span className="text-muted-foreground">{t("ewayLastVerified")}: </span>
                <span
                  className={
                    connection.last_verified_ok === false
                      ? "text-destructive"
                      : "text-foreground"
                  }
                >
                  {verifiedDate}
                </span>
              </div>
            )}

            {connection.last_verified_ok === false && connection.last_verified_error && (
              <p className="text-sm text-destructive">{connection.last_verified_error}</p>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                onClick={handleTest}
                disabled={busy}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-light disabled:opacity-50"
              >
                {t("ewayTestConnection")}
              </button>
              <button
                onClick={handleDisconnect}
                disabled={busy}
                className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                {t("ewayDisconnect")}
              </button>
            </div>
          </div>
        )}

        {connection === null && (
          <form onSubmit={handleConnect} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t("ewayUsername")}</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="off"
                className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("ewayPassword")}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary"
              />
              <p className="mt-1 text-xs text-muted-foreground">{t("ewayPasswordHint")}</p>
            </div>
            <button
              type="submit"
              disabled={busy || !username.trim() || !password}
              className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-white hover:bg-primary-light disabled:opacity-50"
            >
              {busy ? t("ewayConnecting") : t("ewayConnect")}
            </button>
          </form>
        )}

        {error && (
          <div className="rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {info && !error && (
          <div className="rounded-lg border border-border bg-muted p-3 text-sm">{info}</div>
        )}

        {onboarding && (
          <button
            onClick={() => router.push("/queue")}
            className="w-full rounded-lg border border-border bg-background px-4 py-3 font-medium text-foreground hover:bg-muted"
          >
            {connection ? t("continue") : t("skipForNow")}
          </button>
        )}
      </div>
    </main>
  );
}

export default function EwaySettingsPage() {
  return (
    <Suspense fallback={null}>
      <EwaySettings />
    </Suspense>
  );
}
