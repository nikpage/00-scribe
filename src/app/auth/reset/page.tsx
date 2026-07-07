"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLang } from "@/hooks/use-lang";
import { LangToggle } from "@/components/lang-toggle";

export default function ResetPasswordPage() {
  const { lang, switchLang, t } = useLang();
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);

    // The recovery session was established by /auth/callback before we got here,
    // so updateUser applies to the account that requested the reset.
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }
    router.push("/");
  }

  return (
    <div className="min-h-screen p-4 pt-8">
      <div className="w-full max-w-sm mx-auto space-y-6">
        <div className="flex justify-end"><LangToggle lang={lang} onSwitch={switchLang} /></div>
        <div className="text-center">
          <h1 className="text-2xl font-bold">{t("resetPasswordTitle")}</h1>
          <p className="mt-2 text-muted-foreground">{t("resetPasswordDesc")}</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            autoComplete="new-password"
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
            {saving ? t("updatingPassword") : t("updatePassword")}
          </button>
        </form>
        {error && <p className="text-sm text-destructive text-center">{error}</p>}
      </div>
    </div>
  );
}
