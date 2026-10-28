import { describe, expect, it } from "vitest";
import { trimesterReport } from "./trimester";

const now = new Date("2026-03-20T12:00:00Z");
const schedules = [
  { phase_number: 1, due_date: "2026-03-01T23:59:00Z" },
  { phase_number: 2, due_date: "2026-04-15T23:59:00Z" },
  { phase_number: 3, due_date: "2026-05-01T23:59:00Z" },
  { phase_number: 4, due_date: "2026-06-01T23:59:00Z" },
];

const classes = [
  {
    id: "c1",
    name: "2º ano B",
    late_penalty_per_day: 0.5,
    schedules,
    groups: [
      {
        id: "g1",
        group_name: "Plantas",
        group_members: [{ profiles: { name: "Ana" } }],
        // Phase 1 delivered 2 days late → 1,0 point off.
        projects: { current_phase: 2, phase_submissions: [{ phase_number: 1, submitted_at: "2026-03-03T10:00:00Z" }] },
        grades: [
          { trimester: 1, score: 8, feedback: null, is_reference_ten: false },
          { trimester: 2, score: 0.5, feedback: null, is_reference_ten: false },
        ],
      },
      {
        id: "g2",
        group_name: "Água",
        group_members: [],
        projects: { current_phase: 2, phase_submissions: [{ phase_number: 1, submitted_at: "2026-03-01T10:00:00Z" }] },
        grades: [],
      },
    ],
  },
];

describe("trimester report", () => {
  it("subtracts the group's late penalty from the launched grade", () => {
    const [c] = trimesterReport(classes, 1, now);
    const plantas = c!.rows.find((r) => r.groupId === "g1")!;
    expect(plantas.score).toBe(8);
    expect(plantas.penalty).toBe(1);
    expect(plantas.total).toBe(7);
  });

  it("never lets the total go below zero", () => {
    const [c] = trimesterReport(classes, 2, now);
    expect(c!.rows.find((r) => r.groupId === "g1")!.total).toBe(0);
  });

  it("leaves groups without a launched grade without a total", () => {
    const [c] = trimesterReport(classes, 1, now);
    const agua = c!.rows.find((r) => r.groupId === "g2")!;
    expect(agua.score).toBeNull();
    expect(agua.total).toBeNull();
    expect(c!.launched).toBe(1);
  });
});
