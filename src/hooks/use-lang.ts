"use client";

import { useState, useEffect, useCallback } from "react";
import { type Lang, type TranslationKey, detectLang, t as translate } from "@/lib/i18n";

export function useLang() {
  const [lang, setLang] = useState<Lang>("cs");

  useEffect(() => {
    const saved = localStorage.getItem("scribe-lang") as Lang | null;
    setLang(saved ?? detectLang());
  }, []);

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
