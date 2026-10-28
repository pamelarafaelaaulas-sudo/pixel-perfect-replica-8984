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
