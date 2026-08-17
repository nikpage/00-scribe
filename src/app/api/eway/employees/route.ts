import { NextResponse } from "next/server";
import { getEwaySessionForCurrentUser, callEwayWithSessionRetry } from "@/lib/eway/session";
import { getEmployees } from "@/lib/eway/journal";
import { getCachedPeople } from "@/lib/eway/people-cache";

// GET /api/eway/employees — the worker's eWay employees (Users module), whole
// list, cached like the contact list. The UI shows them as a dropdown, so there
// is no query parameter to filter by.
export async function GET(request: Request) {
  const sess = await getEwaySessionForCurrentUser();
  if (!sess.ok) return NextResponse.json({ error: sess.error }, { status: sess.status });

  const { searchParams } = new URL(request.url);
  const refresh = searchParams.get("refresh") === "1";

  try {
    const employees = await getCachedPeople("employees", sess.userId, refresh, () =>
      callEwayWithSessionRetry(sess, (session) => getEmployees(session))
    );
    return NextResponse.json(
      { employees, total: employees.length },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Employee lookup failed" },
      { status: 502 }
    );
  }
}
