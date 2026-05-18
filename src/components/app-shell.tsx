"use client";

import { createContext, useContext, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLang } from "@/hooks/use-lang";
import { LangToggle } from "@/components/lang-toggle";
import { IdleProvider } from "@/hooks/use-idle";
import { ReauthModal } from "@/components/reauth-modal";
import type { TranslationKey } from "@/lib/i18n";

export type AppUser = {
  id: string;
  email: string;
  name: string;
  isManager: boolean;
};

const UserContext = createContext<AppUser | null>(null);

export function useAppUser(): AppUser {
  const u = useContext(UserContext);
  if (!u) throw new Error("useAppUser must be used inside AppShell");
  return u;
}

type NavItem = { href: string; label: TranslationKey; icon: React.ReactNode };

const baseItems: NavItem[] = [
  {
    href: "/record",
    label: "record",
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
    ),
  },
  {
    href: "/queue",
    label: "queue",
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
      </svg>
    ),
  },
  {
    href: "/clients",
    label: "clients",
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-2a4 4 0 100-8 4 4 0 000 8zm6 0a3 3 0 100-6 3 3 0 000 6z" />
      </svg>
    ),
  },
  {
    href: "/transcripts",
    label: "transcripts",
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
];

const managerItem: NavItem = {
  href: "/manager",
  label: "manager",
  icon: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
};

export function AppShell({ user, children }: { user: AppUser; children: React.ReactNode }) {
  const { lang, switchLang, t } = useLang();
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [locked, setLocked] = useState(false);

  const items = user.isManager ? [...baseItems, managerItem] : baseItems;

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/auth/login");
  }

  return (
    <UserContext.Provider value={user}>
     <IdleProvider onTimeout={() => setLocked(true)}>
      <ReauthModal open={locked} onSuccess={() => setLocked(false)} />
      <div className="min-h-screen bg-background">
        <div className="flex">
          <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-muted/50 md:flex md:min-h-screen">
            <div className="flex items-center justify-between p-6">
              <h1 className="text-xl font-bold">{t("appName")}</h1>
              <LangToggle lang={lang} onSwitch={switchLang} />
            </div>
            <nav className="flex-1 space-y-1 px-3">
              {items.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
                    isActive(item.href)
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {item.icon}
                  {t(item.label)}
                </a>
              ))}
            </nav>
            <div className="border-t border-border p-3">
              <div className="px-3 py-2 text-sm">
                <div className="truncate font-medium">{user.name}</div>
                <div className="truncate text-xs text-muted-foreground">{user.email}</div>
              </div>
              <button
                onClick={logout}
                className="w-full rounded-lg px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted"
              >
                {t("logout")}
              </button>
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            <header className="flex items-center justify-between border-b border-border bg-background p-3 md:hidden">
              <h1 className="font-bold">{t("appName")}</h1>
              <div className="flex items-center gap-3">
                <LangToggle lang={lang} onSwitch={switchLang} />
                <button onClick={logout} className="text-sm text-muted-foreground">
                  {t("logout")}
                </button>
              </div>
            </header>
            <div className="pb-20 md:pb-0">{children}</div>
          </div>
        </div>

        <nav className="fixed bottom-0 left-0 right-0 border-t border-border bg-background md:hidden">
          <div className="flex justify-around py-2">
            {items.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center p-2 ${
                  isActive(item.href) ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {item.icon}
                <span className="text-xs">{t(item.label)}</span>
              </a>
            ))}
          </div>
        </nav>
      </div>
     </IdleProvider>
    </UserContext.Provider>
  );
}
