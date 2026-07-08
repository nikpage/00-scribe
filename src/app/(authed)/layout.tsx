import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/setup");

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, is_manager")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/setup");

  return (
    <AppShell
      user={{
        id: user.id,
        email: user.email ?? "",
        name: profile.name,
        isManager: !!profile.is_manager,
      }}
    >
      {children}
    </AppShell>
  );
}
