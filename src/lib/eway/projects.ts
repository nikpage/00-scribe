import { ewayCall } from "./client";
import { getUsers } from "./journal";

// Every project a meeting can be filed against, and who may be assigned in one.
//
// All projects are returned (~390): a meeting's parent project is one of the
// standing meetings, but a tab inside it can be any project at all, so the
// picker cannot be a shortlist. Duplicate names keep their first match — the
// later ones are older copies. No GUID is hardcoded.
//
// A project's "Tým" tab is not a field on the Project object: it is a relation
// of type TEAM pointing at Users (confirmed live — 1313 of them across the
// instance). Members are intersected with getUsers(), which already drops
// inactive/system/API accounts, so people who have left don't appear.

export type MeetingProject = {
  /** The eWay project name, shown in the picker; also the id used in the form. */
  name: string;
  /** eWay Project ItemGUID. */
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

  const projects: MeetingProject[] = [];
  for (const project of byName.values()) {
    const name = str(project, "FileAs") ?? str(project, "ProjectName");
    const guid = str(project, "ItemGUID");
    if (!name || !guid) continue;

    const members: MeetingProject["members"] = [];
    const seen = new Set<string>();
    for (const rel of asArray(project.Relations)) {
      if (str(rel, "RelationType") !== "TEAM") continue;
      // The user is whichever side of the relation isn't the project itself.
      for (const key of ["ItemGUID1", "ItemGUID2", "ForeignItemGUID"]) {
        const memberGuid = (str(rel, key) ?? "").toLowerCase();
        const memberName = activeUsers.get(memberGuid);
        if (memberName && !seen.has(memberGuid)) {
          seen.add(memberGuid);
          members.push({ guid: memberGuid, name: memberName });
        }
      }
    }
    members.sort((a, b) => a.name.localeCompare(b.name, "cs"));

    projects.push({ name, guid, members });
  }

  projects.sort((a, b) => a.name.localeCompare(b.name, "cs"));
  return projects;
}
