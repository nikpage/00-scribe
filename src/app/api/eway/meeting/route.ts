import { NextResponse } from "next/server";
import { getEwaySessionForCurrentUser, callEwayWithSessionRetry } from "@/lib/eway/session";
import { saveMeeting, type MeetingAssignment, type MeetingTab } from "@/lib/eway/meeting";
import { getMeetingProjects } from "@/lib/eway/projects";
import { logAudit } from "@/lib/audit";

// POST /api/eway/meeting — save typed meeting minutes into eWay.
//
// Body: { teamId, date, tabs: [{ projectName, notes,
//          assignments: [{ solverGuid, text, start, due, reminder }] }] }
//
// teamId is the meeting's project: the minutes file under it, and every task
// rolls up to it. Each tab names another project that was discussed, and that
// tab's tasks file under *that* project — one task record, listed on both.
// Projects and the meeting project's Tym are re-read from eWay here, so an
// unknown project or a solver who isn't on the Tym is rejected rather than
// quietly filed against the wrong person.
export async function POST(request: Request) {
  const sess = await getEwaySessionForCurrentUser();
  if (!sess.ok) return NextResponse.json({ error: sess.error }, { status: sess.status });

  const body = await request.json().catch(() => null);
  const wantedProject = typeof body?.teamId === "string" ? body.teamId : "";
  const date = typeof body?.date === "string" ? body.date : "";
  const rawTabs = Array.isArray(body?.tabs) ? body.tabs : [];

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Missing or malformed date" }, { status: 400 });
  }

  const projects = await callEwayWithSessionRetry(sess, (session) => getMeetingProjects(session));
  const project = projects.find((p) => p.name === wantedProject);
  if (!project || !project.guid) {
    return NextResponse.json({ error: "Unknown project" }, { status: 400 });
  }
  const projectGuid = project.guid;

  const tabs: MeetingTab[] = [];
  let assignmentCount = 0;
  let noteCount = 0;
  for (const rawTab of rawTabs) {
    const projectName = typeof rawTab?.projectName === "string" ? rawTab.projectName.trim() : "";
    const notes = typeof rawTab?.notes === "string" ? rawTab.notes : "";
    const rawAssignments = Array.isArray(rawTab?.assignments) ? rawTab.assignments : [];

    const assignments: MeetingAssignment[] = [];
    for (const raw of rawAssignments) {
      const text = typeof raw?.text === "string" ? raw.text.trim() : "";
      const solverGuid = typeof raw?.solverGuid === "string" ? raw.solverGuid : "";
      if (!text) continue; // an empty row the note-taker left behind
      // Solvers come from the meeting project's Tym — the people in the room —
      // not from the discussed project's.
      const member = project.members.find((m) => m.guid === solverGuid.toLowerCase());
      if (!member) {
        return NextResponse.json(
          { error: `Assignment "${text}" has no valid team member` },
          { status: 400 }
        );
      }
      const due =
        typeof raw?.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.due) ? raw.due : null;
      const start =
        typeof raw?.start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.start) ? raw.start : null;
      const reminder =
        typeof raw?.reminder === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.reminder)
          ? raw.reminder
          : null;
      assignments.push({ solverGuid, solverName: member.name, text, start, due, reminder });
    }

    if (!notes.trim() && assignments.length === 0) continue; // an untouched tab
    // The tab's project is a filing target now, so it must resolve to a GUID.
    const tabProject = projects.find((p) => p.name === projectName);
    if (!projectName || !tabProject?.guid) {
      return NextResponse.json({ error: "Unknown project in a tab" }, { status: 400 });
    }
    noteCount += notes.trim() ? 1 : 0;
    assignmentCount += assignments.length;
    tabs.push({ projectName, projectGuid: tabProject.guid, notes, assignments });
  }

  if (noteCount === 0 && assignmentCount === 0) {
    return NextResponse.json({ error: "Nothing to save" }, { status: 400 });
  }

  // eWay won't insert a task without a delegator, and the delegator is the
  // worker filing it. LogIn returns their user GUID; without it, tasks would
  // fail one by one after the minutes had already saved.
  if (assignmentCount && !sess.ewayUserGuid) {
    return NextResponse.json(
      { error: "eWay did not return your user id; reconnect eWay in settings." },
      { status: 502 }
    );
  }

  try {
    const result = await callEwayWithSessionRetry(sess, (session) =>
      saveMeeting(session, {
        projectGuid,
        projectName: project.name,
        date,
        tabs,
        delegatorGuid: sess.ewayUserGuid ?? "",
      })
    );

    await logAudit({
      actorId: sess.userId,
      action: "eway_meeting_save",
      targetType: "system",
      metadata: {
        ok: result.ok,
        journalGuid: result.journalGuid,
        project: project.name,
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
