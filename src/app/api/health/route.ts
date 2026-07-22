import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/health — unauthenticated liveness + dependency check, meant for
// external pinging (app-hub's daily heartbeat, an uptime monitor). Reports
// only ok/latency, no data. Mirrors notify-hub's own GET /health shape.
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  let dbOk = false;
  let dbError: string | null = null;

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("profiles").select("id", { head: true, count: "exact" }).limit(1);
    dbOk = !error;
    dbError = error?.message ?? null;
  } catch (err) {
    dbError = err instanceof Error ? err.message : "Supabase check failed";
  }

  const ok = dbOk;
  return NextResponse.json(
    {
      ok,
      checks: { database: dbOk ? "ok" : "fail" },
      error: dbError,
      latencyMs: Date.now() - started,
      timestamp: new Date().toISOString(),
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
