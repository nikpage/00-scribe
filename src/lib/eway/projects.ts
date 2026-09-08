import { ewayCall } from "./client";
import { getUsers } from "./journal";

// The projects a meeting can be filed against, and who may be assigned in one.
//
// The list of names is fixed — these are the standing meetings, not every
// project in eWay (there are ~390, and IsCompleted is not maintained, so it
// can't filter them). Each name is resolved to a real eWay Project by name at
// request time, the same way journal.ts resolves "Sociální služby <year>", so
// no GUID is hardcoded here.
//
// A project's "Tým" tab is not a field on the Project object: it is a relation
// of type TEAM pointing at Users (confirmed live — 1313 of them across the
// instance). Members are intersected with getUsers(), which already drops
// inactive/system/API accounts, so people who have left don't appear.

export const MEETING_PROJECT_NAMES = [
  "Porada SEDMIČKA",
  "Porada TROJKA",
  "OSA",
  "SOR",
  "Rehabilitace",
  "CDS",
  "PR / MARKETING",
  "PŮJČOVNA",
] as const;

export type MeetingProject = {
  /** The configured name, shown in the picker; also the id used in the form. */
  name: string;
  /** eWay Project ItemGUID, or null when no project of that name exists. */
  guid: string | null;
  /** Active eWay users on that project's Tým, "Surname, First". */
  members: { guid: string; name: string }[];
};

function asArray(data: unknown): Record<string, unknown>[] {
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

function str(obj: Record<string, unknown> | undefined, key: string): string | null {
  const v = obj?.[key];
  return typeof v === "string" ? v : null;
}

// Names are compared without case or diacritics: the list above is typed by a
// person, the eWay name is typed by another, and "PŮJČOVNA" vs "Půjčovna"
// should not decide whether the option works.
function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export async function getMeetingProjects(session: string): Promise<MeetingProject[]> {
  const [projRes, users] = await Promise.all([
    ewayCall(session, "GetProjects", { includeRelations: true }),
    getUsers(session),
  ]);

  const activeUsers = new Map(users.map((u) => [u.guid.toLowerCase(), u.name]));

  const byName = new Map<string, Record<string, unknown>>();
  for (const p of asArray(projRes.data)) {
    const name = str(p, "FileAs") ?? str(p, "ProjectName");
    if (!name) continue;
    // Keep the first match; duplicates of a name are older copies.
    if (!byName.has(fold(name))) byName.set(fold(name), p);
  }

  return MEETING_PROJECT_NAMES.map((name) => {
    const project = byName.get(fold(name));
    if (!project) return { name, guid: null, members: [] };

    const members: MeetingProject["members"] = [];
    const seen = new Set<string>();
    for (const rel of asArray(project.Relations)) {
      if (str(rel, "RelationType") !== "TEAM") continue;
      // The user is whichever side of the relation isn't the project itself.
      for (const key of ["ItemGUID1", "ItemGUID2", "ForeignItemGUID"]) {
        const guid = (str(rel, key) ?? "").toLowerCase();
        const memberName = activeUsers.get(guid);
        if (memberName && !seen.has(guid)) {
          seen.add(guid);
          members.push({ guid, name: memberName });
        }
      }
    }
    members.sort((a, b) => a.name.localeCompare(b.name, "cs"));

    return { name, guid: str(project, "ItemGUID"), members };
  });
}
