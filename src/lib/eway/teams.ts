// Meeting teams. A team is our own concept, not an eWay object: it's just a
// name plus the eWay Users whose meetings get filed together. Kept in code
// while the list is short and only changes when someone asks — moves to a
// table the day non-developers need to edit it.
//
// Member GUIDs are eWay User ItemGUIDs (see GetUsers); they're what a Task's
// Users_TaskSolverGuid is set to, so the picker and the save share one source.

export type TeamMember = {
  guid: string;
  name: string;
};

export type Team = {
  /** Stable id used in URLs and stored prefs; never shown to the user. */
  id: string;
  /** Shown in the picker and used in the journal title. */
  name: string;
  members: TeamMember[];
};

export const TEAMS: Team[] = [
  {
    id: "test",
    name: "Test",
    members: [
      { guid: "2b354e90-3fcf-11f1-a318-b35acdcc6a09", name: "Page, Nik" },
      { guid: "969606f0-2851-11ed-9eda-85d88edcf53d", name: "Střelcová, Pavlína" },
    ],
  },
];

export function getTeam(id: string): Team | undefined {
  return TEAMS.find((t) => t.id === id);
}

// The eWay project every meeting journal is filed under. Not year-suffixed:
// the instance has one standing "Zápisy z porad" project.
export const MEETINGS_PROJECT = {
  guid: "f8c3120c-a2af-11f1-a019-8b0d307348be",
  name: "Zápisy z porad",
} as const;

// Default meeting topic, overridable per meeting in the form.
export const DEFAULT_TOPIC = "Pravidelná";
