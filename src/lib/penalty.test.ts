import { describe, expect, it } from "vitest";
import { daysLate, gradeAfterPenalty, phasePenalty } from "./penalty";

describe("late delivery penalty", () => {
  const due = "2026-10-10T23:59:00-04:00";

  it("is zero when delivered before the deadline", () => {
    expect(daysLate(due, "2026-10-10T20:00:00-04:00")).toBe(0);
  });

  it("counts any time after the deadline as a full day", () => {
    expect(daysLate(due, "2026-10-11T00:30:00-04:00")).toBe(1);
  });

  it("counts two days late and applies 0.5 point per day by default", () => {
    const days = daysLate(due, "2026-10-12T10:00:00-04:00");
    expect(days).toBe(2);
    expect(phasePenalty(days, 0.5)).toBe(1);
  });

  it("keeps counting for phases not yet delivered", () => {
    expect(daysLate(due, null, new Date("2026-10-13T12:00:00-04:00"))).toBe(3);
  });

  it("never lets the grade go below zero", () => {
    expect(gradeAfterPenalty(8, 1.5)).toBe(6.5);
    expect(gradeAfterPenalty(1, 3)).toBe(0);
  });
});

import { projectLateness } from "./penalty";

describe("project lateness across the 4 phases", () => {
  it("adds delivered-late days and still-open late days at the class rate", () => {
    const { phases, totalPenalty } = projectLateness({
      currentPhase: 2,
      perDay: 0.5,
      now: new Date("2026-10-20T12:00:00Z"),
      schedules: [
        { phase_number: 1, due_date: "2026-10-10T12:00:00Z" },
        { phase_number: 2, due_date: "2026-10-18T12:00:00Z" },
        { phase_number: 3, due_date: "2026-11-01T12:00:00Z" },
        { phase_number: 4, due_date: "2026-12-01T12:00:00Z" },
      ],
      submissions: [{ phase_number: 1, submitted_at: "2026-10-11T12:00:00Z" }],
    });
    expect(phases.map((p) => p.daysLate)).toEqual([1, 2, 0, 0]);
    expect(totalPenalty).toBe(1.5);
  });
});

import { classLateness } from "./penalty";

describe("class deadlines overview", () => {
  const schedules = [
    { phase_number: 1, due_date: "2026-10-10T12:00:00Z" },
    { phase_number: 2, due_date: "2026-10-24T12:00:00Z" },
    { phase_number: 3, due_date: "2026-11-07T12:00:00Z" },
    { phase_number: 4, due_date: "2026-11-21T12:00:00Z" },
  ];

  it("sums each group's lost points at the class rate per day and counts late groups", () => {
    const { rows, totalPenalty, lateGroups } = classLateness({
      perDay: 0.5,
      now: new Date("2026-10-20T12:00:00Z"),
      schedules,
      groups: [
        { id: "a", name: "Alfa", members: [], currentPhase: 2, submissions: [{ phase_number: 1, submitted_at: "2026-10-09T12:00:00Z" }] },
        { id: "b", name: "Beta", members: [], currentPhase: 2, submissions: [{ phase_number: 1, submitted_at: "2026-10-13T12:00:00Z" }] },
      ],
    });
    expect(rows.map((r) => [r.id, r.totalDays, r.totalPenalty])).toEqual([
      ["b", 3, 1.5],
      ["a", 0, 0],
    ]);
    expect(totalPenalty).toBe(1.5);
    expect(lateGroups).toBe(1);
  });
});
