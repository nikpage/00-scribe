import { ewayCall } from "./client";
import { MEETINGS_PROJECT } from "./teams";

// Saving a team meeting into eWay.
//
// One meeting produces two kinds of record:
//   - a Journal holding the full written minutes, filed under the standing
//     "Zápisy z porad" project (the same SUPERIORITEM relation the visit
//     journal uses for "Sociální služby <year>");
//   - one Task per assignment, whose Solver is the person it was given to, so
//     it shows up in that person's own task list in eWay/Outlook.
//
// The delegator is the note-taker: eWay refuses to insert a task without
// Users_TaskDelegatorGuid (rcParameterError), so it comes from the eWay user
// GUID that LogIn hands back for the signed-in worker. OwnerGUID is left unset
// — eWay fills that from the session by itself.

// Confirmed against the live instance (GetEnumValues, see docs/eway-api-notes).
const TASK_TYPE_UKOL = "2aa21dd4-c3f3-4e87-b34f-1733f7226070"; // TaskType "Úkol"
const TASK_STATE_NEZAHAJENO = "2ea5d749-dc1c-4d08-91ee-f7c0e393b415"; // Tasks_Task "Nezahájeno"
const TASK_IMPORTANCE_NORMAL = "e49ad497-9cff-4fc0-a214-fa7c54a76f2f"; // TaskImportance "Střední"

export interface MeetingAssignment {
  /** eWay User ItemGUID of the person the task is for. */
  solverGuid: string;
  /** Name as shown in the picker — used in the minutes body, not sent to eWay. */
  solverName: string;
  /** What they agreed to do; becomes the task's subject. */
  text: string;
  /** ISO date (yyyy-mm-dd) or null when the meeting set no deadline. */
  due: string | null;
}

export interface SaveMeetingInput {
  teamName: string;
  topic: string;
  /** ISO date (yyyy-mm-dd) the meeting took place. */
  date: string;
  /** Free-text minutes as typed by the note-taker. */
  notes: string;
  assignments: MeetingAssignment[];
  /** eWay user GUID of the note-taker; becomes each task's delegator. */
  delegatorGuid: string;
}

export interface SaveMeetingResult {
  ok: boolean;
  journalGuid: string | null;
  /** Per-assignment outcome, in input order, so a partial failure is visible. */
  tasks: { solverName: string; text: string; guid: string | null; ok: boolean; error: string | null }[];
  error: string | null;
}

function findGuid(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = Object.entries(raw as Record<string, unknown>).find(
    ([k, v]) => typeof v === "string" && /guid/i.test(k) && v.length > 0
  );
  return entry ? (entry[1] as string) : null;
}

// "Sedmička – Pravidelná – 2026-08-28". Readable in an eWay list on its own,
// which is how the minutes get found later.
export function meetingSubject(input: Pick<SaveMeetingInput, "teamName" | "topic" | "date">): string {
  return `${input.teamName} – ${input.topic} – ${input.date}`;
}

// The minutes body: what was typed, then the assignments spelled out, so the
// journal alone is a complete record even though the tasks live separately.
export function meetingBody(input: SaveMeetingInput): string {
  const parts = [input.notes.trim()];
  if (input.assignments.length) {
    const lines = input.assignments.map((a) => {
      const due = a.due ? ` (do ${a.due})` : "";
      return `- ${a.solverName}: ${a.text}${due}`;
    });
    parts.push(`Úkoly:\n${lines.join("\n")}`);
  }
  return parts.filter(Boolean).join("\n\n");
}


// eWay reports a refused save in more than one place depending on why. Collect
// whatever is populated rather than trusting Description alone.
function describeFailure(res: { returnCode: string; description: string | null; raw: unknown }): string {
  const parts: string[] = [];
  if (res.description) parts.push(res.description);
  const raw = res.raw as Record<string, unknown> | null;
  const userErrors = raw?.UserErrorMessages ?? raw?.ErrorMessage;
  if (Array.isArray(userErrors)) parts.push(...userErrors.map(String));
  else if (typeof userErrors === "string" && userErrors) parts.push(userErrors);
  if (!parts.length) parts.push(res.returnCode);
  return parts.join("; ");
}

export async function saveMeeting(
  session: string,
  input: SaveMeetingInput
): Promise<SaveMeetingResult> {
  const subject = meetingSubject(input);
  const body = meetingBody(input);
  // A meeting is an all-day record; eWay wants both ends of the event.
  const start = `${input.date}T00:00:00`;
  const end = `${input.date}T23:59:00`;

  const save = await ewayCall(session, "SaveJournal", {
    transmitObject: {
      FileAs: subject,
      Subject: subject,
      Note: body,
      EventStart: start,
      EventEnd: end,
    },
    dieOnItemConflict: false,
  });
  const journalGuid = findGuid(save.raw);

  if (!save.ok || !journalGuid) {
    return {
      ok: false,
      journalGuid,
      tasks: [],
      error: save.description ?? save.returnCode ?? "Journal save failed",
    };
  }

  // File the minutes under the meetings project. Same relation shape as the
  // visit journal's Superior Item.
  const superior = await ewayCall(session, "SaveRelation", {
    transmitObject: {
      ItemGUID1: journalGuid,
      FolderName1: "Journal",
      ItemGUID2: MEETINGS_PROJECT.guid,
      FolderName2: "Projects",
      RelationType: "SUPERIORITEM",
      DifferDirection: true,
    },
  });

  const tasks: SaveMeetingResult["tasks"] = [];
  for (const a of input.assignments) {
    const res = await ewayCall(session, "SaveTask", {
      transmitObject: {
        FileAs: a.text,
        Subject: a.text,
        // Point back at the meeting the task came out of.
        Body: `${subject}\n\n${a.text}`,
        StartDate: `${input.date}T00:00:00`,
        ...(a.due ? { DueDate: `${a.due}T00:00:00` } : {}),
        TypeEn: TASK_TYPE_UKOL,
        StateEn: TASK_STATE_NEZAHAJENO,
        ImportanceEn: TASK_IMPORTANCE_NORMAL,
        IsCompleted: false,
        Users_TaskSolverGuid: a.solverGuid,
        Users_TaskDelegatorGuid: input.delegatorGuid,
        Projects_TaskParentGuid: MEETINGS_PROJECT.guid,
        Projects_TopLevelProjectGuid: MEETINGS_PROJECT.guid,
      },
      dieOnItemConflict: false,
    });
    tasks.push({
      solverName: a.solverName,
      text: a.text,
      guid: findGuid(res.raw),
      ok: res.ok,
      // eWay puts field-level complaints in UserErrorMessages / Description;
      // keep whichever it actually filled so the cause isn't swallowed.
      error: res.ok ? null : describeFailure(res),
    });
  }

  const failed = tasks.filter((t) => !t.ok);
  return {
    ok: failed.length === 0 && superior.ok,
    journalGuid,
    tasks,
    error: failed.length
      ? `${failed.length} úkolů se neuložilo`
      : superior.ok
        ? null
        : `Zápis uložen, ale nepodařilo se ho zařadit do projektu ${MEETINGS_PROJECT.name}`,
  };
}
