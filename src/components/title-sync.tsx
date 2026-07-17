"use client";

import { useEffect } from "react";
import { useLang } from "@/hooks/use-lang";

// The <title> in layout.tsx's metadata is fixed at build time and can't
// read the client-side language toggle, so this syncs document.title to it
// on every page, including outside AppShell (e.g. /setup).
export function TitleSync() {
  const { t } = useLang();
  useEffect(() => {
    document.title = t("appName");
  }, [t]);
  return null;
}
