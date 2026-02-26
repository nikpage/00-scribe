"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useLang } from "@/hooks/use-lang";
import { LangToggle } from "@/components/lang-toggle";

export default function SetupPage() {
  const { lang, switchLang, t } = useLang();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      await supabase.from("profiles").upsert({
        id: user.id,
        name,
      });
    }

    router.push("/");
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
      </div>
    </div>
  );
}
