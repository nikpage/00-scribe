import { NextResponse } from "next/server";
import { getEwaySessionForCurrentUser, callEwayWithSessionRetry } from "@/lib/eway/session";
import { saveMeeting, type MeetingAssignment } from "@/lib/eway/meeting";
import { getTeam } from "@/lib/eway/teams";
import { logAudit } from "@/lib/audit";

// POST /api/eway/meeting — save typed meeting minutes into eWay.
//
// Body: { teamId, topic, date, notes, assignments: [{ solverGuid, text, due }] }
// The team (and therefore who may be assigned) comes from the server-side team
// list, so a bad teamId or a solver who isn't on that team is rejected here
// rather than quietly filed against the wrong person.
export async function POST(request: Request) {
  const sess = await getEwaySessionForCurrentUser();
  if (!sess.ok) return NextResponse.json({ error: sess.error }, { status: sess.status });

  const body = await request.json().catch(() => null);
  const team = getTeam(typeof body?.teamId === "string" ? body.teamId : "");
  const topic = typeof body?.topic === "string" ? body.topic.trim() : "";
  const date = typeof body?.date === "string" ? body.date : "";
  const notes = typeof body?.notes === "string" ? body.notes : "";

  if (!team) return NextResponse.json({ error: "Unknown team" }, { status: 400 });
  if (!topic) return NextResponse.json({ error: "Missing topic" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Missing or malformed date" }, { status: 400 });
  }

  const rawAssignments = Array.isArray(body?.assignments) ? body.assignments : [];
  const assignments: MeetingAssignment[] = [];
  for (const raw of rawAssignments) {
    const text = typeof raw?.text === "string" ? raw.text.trim() : "";
    const solverGuid = typeof raw?.solverGuid === "string" ? raw.solverGuid : "";
    if (!text) continue; // an empty row the note-taker left behind
    const member = team.members.find((m) => m.guid === solverGuid);
    if (!member) {
      return NextResponse.json(
        { error: `Assignment "${text}" has no valid team member` },
        { status: 400 }
      );
    }
    const due = typeof raw?.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.due) ? raw.due : null;
    assignments.push({ solverGuid, solverName: member.name, text, due });
  }

  if (!notes.trim() && assignments.length === 0) {
    return NextResponse.json({ error: "Nothing to save" }, { status: 400 });
  }

  try {
    const result = await callEwayWithSessionRetry(sess, (session) =>
      saveMeeting(session, {
        teamName: team.name,
        topic,
        date,
        notes,
        assignments,
      })
    );

    await logAudit({
      actorId: sess.userId,
      action: "eway_meeting_save",
      targetType: "system",
      metadata: {
        ok: result.ok,
        journalGuid: result.journalGuid,
        team: team.name,
        tasks: result.tasks.length,
        tasksFailed: result.tasks.filter((t) => !t.ok).length,
      },
    });

    if (!result.ok) {
      return NextResponse.json({ ...result, error: result.error }, { status: 502 });
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Meeting save failed" },
      { status: 502 }
    );
  }
}
