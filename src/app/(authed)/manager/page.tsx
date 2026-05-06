"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ManagerDashboard } from "@/components/manager-dashboard";
import { useLang } from "@/hooks/use-lang";
import { useAppUser } from "@/components/app-shell";

import type { Recording } from "@/hooks/use-recordings";

type ManagerRecording = Recording & {
  profiles: { name: string };
};

export default function ManagerPage() {
  const { t } = useLang();
  const user = useAppUser();
  const [recordings, setRecordings] = useState<ManagerRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    if (!user.isManager) {
      setLoading(false);
      return;
    }
    async function load() {
      const { data } = await supabase
        .from("recordings")
        .select("*, profiles(name)")
        .order("created_at", { ascending: false });

      if (data) setRecordings(data as unknown as ManagerRecording[]);
      setLoading(false);
    }
    load();

    const channel = supabase
      .channel("manager-recordings")
      .on("postgres_changes", { event: "*", schema: "public", table: "recordings" }, () => {
        load();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, user.isManager]);

  if (!user.isManager) {
    return (
      <main className="p-6">
        <div className="text-center text-muted-foreground">
          <p className="text-lg font-medium">{t("accessDenied")}</p>
          <p className="mt-1">{t("needManager")}</p>
          <Link href="/" className="mt-4 inline-block text-primary hover:underline">
            {t("goHome")}
          </Link>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="p-6">
        <div className="text-muted-foreground">{t("loading")}</div>
      </main>
    );
  }

  return (
    <main className="p-4 md:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">{t("manager")}</h2>
        <div className="flex gap-2">
          <a
            href="/manager/needs-review"
            className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            {t("needsReview")} →
          </a>
          <a
            href="/manager/audit-log"
            className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            {t("auditLog")} →
          </a>
        </div>
      </div>
      <ManagerDashboard recordings={recordings} />
    </main>
  );
}
