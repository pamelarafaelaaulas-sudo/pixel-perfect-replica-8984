import { describe, expect, it } from "vitest";
import { buildRoster, filterRoster } from "./roster";

const now = new Date("2026-03-20T12:00:00Z");

const classes = [
  {
    id: "c1",
    name: "2º ano B",
    late_penalty_per_day: 0.5,
    schedules: [
      { phase_number: 1, due_date: "2026-03-01T23:59:00Z" },
      { phase_number: 2, due_date: "2026-03-15T23:59:00Z" },
      { phase_number: 3, due_date: "2026-04-01T23:59:00Z" },
      { phase_number: 4, due_date: "2026-05-01T23:59:00Z" },
    ],
    groups: [
      {
        id: "g1",
        group_name: "Plantas",
        group_members: [
          { student_id: "s2", profiles: { name: "Bruna", email: "b@x.com" } },
          { student_id: "s1", profiles: { name: "Ana", email: "a@x.com" } },
        ],
        // Phase 1 delivered 2 days late; phase 2 still open, 5 days past due on Mar 20.
        projects: { current_phase: 2, phase_submissions: [{ phase_number: 1, submitted_at: "2026-03-03T10:00:00Z" }] },
      },
    ],
  },
];

describe("student roster", () => {
  it("gives every group member the group's deliveries and lateness", () => {
    const rows = buildRoster(classes, now);
    expect(rows.map((r) => r.name)).toEqual(["Ana", "Bruna"]);
    for (const r of rows) {
      expect(r.delivered).toBe(1);
      expect(r.daysLate).toBe(7);
      expect(r.penalty).toBe(3.5);
    }
  });

  it("searches by name ignoring accents and filters by class", () => {
    const rows = buildRoster(classes, now);
    expect(filterRoster(rows, "bruná", null).map((r) => r.name)).toEqual(["Bruna"]);
    expect(filterRoster(rows, "", "other")).toEqual([]);
  });
});
