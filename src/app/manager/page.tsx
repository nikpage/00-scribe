"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ManagerDashboard } from "@/components/manager-dashboard";
import { useLang } from "@/hooks/use-lang";

interface ManagerRecording {
  id: string;
  label: string;
  filename: string;
  recorded_at: string;
  duration_seconds: number | null;
  status: string;
  error: string | null;
  profiles: { name: string };
}

export default function ManagerPage() {
  const { t } = useLang();
  const [recordings, setRecordings] = useState<ManagerRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const [isManager, setIsManager] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Check if manager
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_manager")
        .eq("id", user.id)
        .single();

      if (!profile?.is_manager) {
        setLoading(false);
        return;
      }

      setIsManager(true);

      // Fetch all recordings with worker names
      const { data } = await supabase
        .from("recordings")
        .select("id, label, filename, recorded_at, duration_seconds, status, error, profiles(name)")
        .order("created_at", { ascending: false });

      if (data) setRecordings(data as unknown as ManagerRecording[]);
      setLoading(false);
    }
    load();

    // Realtime subscription
    const channel = supabase
      .channel("manager-recordings")
      .on("postgres_changes", { event: "*", schema: "public", table: "recordings" }, () => {
        load();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">{t("loading")}</div>
      </div>
    );
  }

  if (!isManager) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center text-muted-foreground">
          <p className="text-lg font-medium">{t("accessDenied")}</p>
          <p className="mt-1">{t("needManager")}</p>
          <Link href="/" className="mt-4 inline-block text-primary hover:underline">
            {t("goHome")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden w-64 shrink-0 border-r border-border bg-muted/50 md:block">
          <div className="p-6">
            <h1 className="text-xl font-bold">Scribe</h1>
          </div>
          <nav className="space-y-1 px-3">
            <a
              href="/transcripts"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
            >
              {t("transcripts")}
            </a>
            <a
              href="/queue"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
            >
              {t("queue")}
            </a>
            <a
              href="/manager"
              className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm font-medium text-primary"
            >
              {t("manager")}
            </a>
          </nav>
        </aside>

        <main className="flex-1 p-6">
          <h2 className="mb-6 text-2xl font-bold">{t("manager")}</h2>
          <ManagerDashboard recordings={recordings} />
        </main>
      </div>
    </div>
  );
}
