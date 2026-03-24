"use client";

import { useState, useCallback, useSyncExternalStore } from "react";
import { type Lang, type TranslationKey, detectLang, t as translate } from "@/lib/i18n";

function getStoredLang(): Lang {
  if (typeof window === "undefined") return "cs";
  return (localStorage.getItem("scribe-lang") as Lang | null) ?? detectLang();
}

// Read initial lang synchronously to avoid effect-based setState
const subscribe = () => () => {};

export function useLang() {
  const initialLang = useSyncExternalStore(subscribe, getStoredLang, () => "cs" as Lang);
  const [lang, setLang] = useState<Lang>(initialLang);

  const switchLang = useCallback((newLang: Lang) => {
    setLang(newLang);
    localStorage.setItem("scribe-lang", newLang);
  }, []);

  const t = useCallback(
    (key: TranslationKey) => translate(key, lang),
    [lang]
  );

  return { lang, switchLang, t };
}
