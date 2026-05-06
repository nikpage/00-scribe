"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type IdleContextValue = {
  // Components running long workflows (recording, uploading, transcribing)
  // call this to assert the user is still effectively present even without
  // input events. Call repeatedly while the workflow is active.
  keepAlive: () => void;
};

const IdleContext = createContext<IdleContextValue | null>(null);

export function useIdle(): IdleContextValue {
  const ctx = useContext(IdleContext);
  if (!ctx) throw new Error("useIdle must be used inside IdleProvider");
  return ctx;
}

const MOBILE_IDLE_MS = 5 * 60 * 1000;
const DESKTOP_IDLE_MS = 15 * 60 * 1000;
const MOBILE_BG_TIMEOUT_MS = 2 * 60 * 1000;
const POLL_MS = 30 * 1000;

function isMobile(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 767px)").matches;
}

export function IdleProvider({
  children,
  onTimeout,
}: {
  children: ReactNode;
  onTimeout: () => void;
}) {
  const lastActivityRef = useRef(Date.now());
  const onTimeoutRef = useRef(onTimeout);

  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  const keepAlive = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  useEffect(() => {
    const reset = () => {
      lastActivityRef.current = Date.now();
    };
    const events: (keyof WindowEventMap)[] = [
      "mousemove",
      "keydown",
      "click",
      "touchstart",
      "scroll",
    ];
    for (const ev of events) {
      window.addEventListener(ev, reset, { passive: true });
    }

    let bgStart: number | null = null;
    const onVisibility = () => {
      if (document.hidden) {
        bgStart = Date.now();
        return;
      }
      if (bgStart && isMobile() && Date.now() - bgStart > MOBILE_BG_TIMEOUT_MS) {
        bgStart = null;
        onTimeoutRef.current();
        return;
      }
      bgStart = null;
      lastActivityRef.current = Date.now();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const interval = setInterval(() => {
      const limit = isMobile() ? MOBILE_IDLE_MS : DESKTOP_IDLE_MS;
      if (Date.now() - lastActivityRef.current > limit) {
        onTimeoutRef.current();
      }
    }, POLL_MS);

    return () => {
      for (const ev of events) {
        window.removeEventListener(ev, reset);
      }
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(interval);
    };
  }, []);

  return <IdleContext.Provider value={{ keepAlive }}>{children}</IdleContext.Provider>;
}

// Convenience: a no-op fallback so non-AppShell code paths (auth pages) can
// import useIdle without crashing.
export function useOptionalIdle(): IdleContextValue {
  const ctx = useContext(IdleContext);
  return ctx ?? { keepAlive: () => {} };
}

// Drives keepAlive at a regular interval while `active` is true. Used by
// recording / uploading workflows so the idle timer doesn't fire mid-task.
export function useKeepAliveWhile(active: boolean, intervalMs = 30 * 1000) {
  const { keepAlive } = useOptionalIdle();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    keepAlive();
    const id = setInterval(() => {
      keepAlive();
      setTick((n) => n + 1);
    }, intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs, keepAlive]);
  return tick;
}
