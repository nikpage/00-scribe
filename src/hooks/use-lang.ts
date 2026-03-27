"use client";

import { useCallback, useSyncExternalStore } from "react";
import { type Lang, type TranslationKey, detectLang, t as translate } from "@/lib/i18n";

// Module-level listeners so all components share the same lang state
const listeners = new Set<() => void>();
let currentLang: Lang | null = null;

function getLang(): Lang {
  if (currentLang !== null) return currentLang;
  if (typeof window === "undefined") return "cs";
  currentLang = (localStorage.getItem("scribe-lang") as Lang | null) ?? detectLang();
  return currentLang;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setLang(newLang: Lang) {
  currentLang = newLang;
  localStorage.setItem("scribe-lang", newLang);
  listeners.forEach((l) => l());
}

export function useLang() {
  const lang = useSyncExternalStore(subscribe, getLang, () => "cs" as Lang);

  const switchLang = useCallback((newLang: Lang) => {
    setLang(newLang);
  }, []);

  const t = useCallback(
    (key: TranslationKey) => translate(key, lang),
    [lang]
  );

  return { lang, switchLang, t };
}
