"use client";

import { useLang } from "@/hooks/use-lang";

type NavItem = "queue" | "record" | "transcripts";

export function BottomNav({ active }: { active: NavItem }) {
  const { t } = useLang();

  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-border bg-background md:hidden">
      <div className="flex justify-around py-2">
        <a
          href="/queue"
          className={`flex flex-col items-center p-2 ${active === "queue" ? "text-primary" : "text-muted-foreground"}`}
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
          <span className="text-xs">{t("queue")}</span>
        </a>
        <a
          href="/record"
          className={`flex flex-col items-center p-2 ${active === "record" ? "text-primary" : "text-muted-foreground"}`}
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span className="text-xs">{t("record")}</span>
        </a>
        <a
          href="/transcripts"
          className={`flex flex-col items-center p-2 ${active === "transcripts" ? "text-primary" : "text-muted-foreground"}`}
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-xs">{t("transcripts")}</span>
        </a>
      </div>
    </nav>
  );
}
