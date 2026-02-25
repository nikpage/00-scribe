"use client";

import type { Lang } from "@/lib/i18n";

interface LangToggleProps {
  lang: Lang;
  onSwitch: (lang: Lang) => void;
}

export function LangToggle({ lang, onSwitch }: LangToggleProps) {
  return (
    <button
      onClick={() => onSwitch(lang === "cs" ? "en" : "cs")}
      className="rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
      aria-label="Switch language"
    >
      {lang === "cs" ? "EN" : "CZ"}
    </button>
  );
}
