"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useLang } from "@/hooks/use-lang";
import { LangToggle } from "@/components/lang-toggle";

// Local Czech numbers are typed without a country code; default to it so
// users don't have to know/type "+420" themselves.
function normalizePhoneInput(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.startsWith("420")) return digits;
  return `420${digits}`;
}

export default function SetupPage() {
  const { lang, switchLang, t } = useLang();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const supabase = createClient();
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);

    // Identity with no login screen: reuse the device's existing session if it
    // has one, otherwise silently create an anonymous account. Each device gets
    // its own real auth user, so per-worker data stays separated with no
    // password, code, or email step.
    let {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const { data, error: signInError } = await supabase.auth.signInAnonymously();
      if (signInError || !data.user) {
        setSaving(false);
        setError(signInError?.message || t("authFailed"));
        return;
      }
      user = data.user;
    }

    const { error: upsertError } = await supabase
      .from("profiles")
      .upsert({ id: user.id, name, phone: normalizePhoneInput(phone) });

    setSaving(false);

    if (upsertError) {
      setError(upsertError.message);
      return;
    }

    router.push("/settings/eway?onboarding=1");
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-end"><LangToggle lang={lang} onSwitch={switchLang} /></div>

        <div className="text-center">
          <h1 className="text-2xl font-bold">{t("welcomeTitle")}</h1>
          <p className="mt-2 text-muted-foreground">{t("enterName")}</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            autoComplete="name"
            placeholder={t("fullName")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary"
          />
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
            disabled={saving}
            className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-white hover:bg-primary-light disabled:opacity-50"
          >
            {saving ? t("saving") : t("continue")}
          </button>
        </form>
        {error && <p className="text-sm text-destructive text-center">{error}</p>}
      </div>
    </div>
  );
}
