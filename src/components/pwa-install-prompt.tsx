"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/hooks/use-lang";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "scribe-install-dismissed";

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
}

export function PwaInstallPrompt() {
  const { lang } = useLang();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOS, setShowIOS] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (isStandalone()) return;
    if (localStorage.getItem(DISMISS_KEY) === "1") return;

    const w = window as Window & { __deferredInstall?: BeforeInstallPromptEvent };

    const pickUp = () => {
      if (w.__deferredInstall) {
        setDeferred(w.__deferredInstall);
        setHidden(false);
      }
    };

    pickUp();

    const onPrompt = (e: Event) => {
      e.preventDefault();
      w.__deferredInstall = e as BeforeInstallPromptEvent;
      setDeferred(e as BeforeInstallPromptEvent);
      setHidden(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("pwa-install-ready", pickUp);

    if (isIOS()) {
      setShowIOS(true);
      setHidden(false);
    }

    const onInstalled = () => {
      setHidden(true);
      setDeferred(null);
      setShowIOS(false);
      w.__deferredInstall = undefined;
    };
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("pwa-install-ready", pickUp);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (hidden || (!deferred && !showIOS)) return null;

  const cs = lang === "cs";
  const title = cs ? "Nainstalovat aplikaci" : "Install app";
  const desc = showIOS
    ? cs
      ? "Klepněte na Sdílet a poté „Přidat na plochu“."
      : "Tap Share, then \"Add to Home Screen\"."
    : cs
      ? "Přidejte Scribe na plochu pro rychlejší přístup."
      : "Add Scribe to your home screen for faster access.";
  const installLabel = cs ? "Nainstalovat" : "Install";
  const laterLabel = cs ? "Později" : "Not now";

  async function handleInstall() {
    if (!deferred) return;
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") {
        localStorage.setItem(DISMISS_KEY, "1");
        setHidden(true);
      }
    } finally {
      setDeferred(null);
      (window as Window & { __deferredInstall?: BeforeInstallPromptEvent }).__deferredInstall = undefined;
    }
  }

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setHidden(true);
  }

  return (
    <div className="fixed inset-x-0 bottom-16 z-50 mx-auto max-w-md px-4 md:bottom-4">
      <div className="rounded-lg border border-border bg-background p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <img src="/icons/icon-192.png" alt="" className="h-10 w-10 rounded-md" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
            <div className="mt-3 flex gap-2">
              {!showIOS && (
                <button
                  onClick={handleInstall}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                >
                  {installLabel}
                </button>
              )}
              <button
                onClick={handleDismiss}
                className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
              >
                {laterLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
