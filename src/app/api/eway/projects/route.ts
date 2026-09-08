import { NextResponse } from "next/server";
import { getEwaySessionForCurrentUser, callEwayWithSessionRetry } from "@/lib/eway/session";
import { getMeetingProjects } from "@/lib/eway/projects";

// GET /api/eway/projects — the meeting projects with their eWay Tým members.
//
// 404 when the worker has no saved eWay credentials, same contract as the
// other eWay routes, so the client can flag the "connect eWay" nudge.
export async function GET() {
  const sess = await getEwaySessionForCurrentUser();
  if (!sess.ok) return NextResponse.json({ error: sess.error }, { status: sess.status });

  try {
    const projects = await callEwayWithSessionRetry(sess, (session) =>
      getMeetingProjects(session)
    );
    return NextResponse.json({ projects });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load projects" },
      { status: 502 }
    );
  }
}
