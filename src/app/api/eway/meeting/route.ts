import { NextResponse } from "next/server";
import { getEwaySessionForCurrentUser, callEwayWithSessionRetry } from "@/lib/eway/session";
import { saveMeeting, type MeetingAssignment, type MeetingTab } from "@/lib/eway/meeting";
import { getMeetingProjects } from "@/lib/eway/projects";
import { logAudit } from "@/lib/audit";

// POST /api/eway/meeting — save typed meeting minutes into eWay.
//
// Body: { teamId, topic, date, tabs: [{ projectName, notes,
//          assignments: [{ solverGuid, text, start, due }] }] }
//
// teamId is the parent project everything files under. Each tab names another
// project that was discussed; that name is a label on the minutes and on each
// task, never where the task is filed. Projects and the parent's Tym are
// re-read from eWay here, so an unknown project or a solver who isn't on the
// parent's Tym is rejected rather than quietly filed against the wrong person.
export async function POST(request: Request) {
  const sess = await getEwaySessionForCurrentUser();
  if (!sess.ok) return NextResponse.json({ error: sess.error }, { status: sess.status });

  const body = await request.json().catch(() => null);
  const wantedProject = typeof body?.teamId === "string" ? body.teamId : "";
  const topic = typeof body?.topic === "string" ? body.topic.trim() : "";
  const date = typeof body?.date === "string" ? body.date : "";
  const rawTabs = Array.isArray(body?.tabs) ? body.tabs : [];

  if (!topic) return NextResponse.json({ error: "Missing topic" }, { status: 400 });
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
      // Solvers come from the parent project's Tym, because that is where the
      // task is filed — not from the discussed project's.
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
      assignments.push({ solverGuid, solverName: member.name, text, start, due });
    }

    if (!notes.trim() && assignments.length === 0) continue; // an untouched tab
    if (!projectName || !projects.some((p) => p.name === projectName)) {
      return NextResponse.json({ error: "Unknown project in a tab" }, { status: 400 });
    }
    noteCount += notes.trim() ? 1 : 0;
    assignmentCount += assignments.length;
    tabs.push({ projectName, notes, assignments });
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
        topic,
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
