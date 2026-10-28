import { describe, expect, it } from "vitest";
import { classLateness, phaseTotals } from "./penalty";

const now = new Date("2026-03-20T12:00:00Z");
const schedules = [
  { phase_number: 1, due_date: "2026-03-01T23:59:00Z" },
  { phase_number: 2, due_date: "2026-03-15T23:59:00Z" },
  { phase_number: 3, due_date: "2026-04-01T23:59:00Z" },
  { phase_number: 4, due_date: "2026-05-01T23:59:00Z" },
];

describe("per-phase deadline totals", () => {
  const { rows } = classLateness({
    perDay: 0.5,
    schedules,
    now,
    groups: [
      // on time in phase 1; phase 2 open and 5 days past due
      { id: "a", name: "A", members: [], currentPhase: 2, submissions: [{ phase_number: 1, submitted_at: "2026-03-01T10:00:00Z" }] },
      // phase 1 delivered 2 days late; phase 2 open
      { id: "b", name: "B", members: [], currentPhase: 2, submissions: [{ phase_number: 1, submitted_at: "2026-03-03T10:00:00Z" }] },
    ],
  });
  const totals = phaseTotals(rows);

  it("counts on-time and late deliveries for a phase and sums its discount", () => {
    expect(totals[0]).toMatchObject({ onTime: 1, deliveredLate: 1, days: 2, penalty: 1 });
  });

  it("keeps charging open phases after the deadline", () => {
    expect(totals[1]).toMatchObject({ openLate: 2, days: 10, penalty: 5 });
  });
});
