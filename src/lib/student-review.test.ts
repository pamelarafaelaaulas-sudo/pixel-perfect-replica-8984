import { describe, expect, it } from "vitest";
import { projectLateness } from "./penalty";
import { studentSummary } from "./student-review";

describe("per-student review before launching a bimestre", () => {
  const { phases, totalPenalty } = projectLateness({
    currentPhase: 3,
    perDay: 0.5,
    now: new Date("2026-10-20T12:00:00Z"),
    schedules: [
      { phase_number: 1, due_date: "2026-10-01T12:00:00Z" },
      { phase_number: 2, due_date: "2026-10-10T12:00:00Z" },
      { phase_number: 3, due_date: "2026-11-01T12:00:00Z" },
      { phase_number: 4, due_date: "2026-12-01T12:00:00Z" },
    ],
    submissions: [
      { phase_number: 1, submitted_at: "2026-09-30T12:00:00Z" },
      { phase_number: 2, submitted_at: "2026-10-12T12:00:00Z" },
    ],
  });

  const summary = studentSummary({
    phases,
    totalPenalty,
    aiByPhase: { 1: 8, 2: 6.5 },
    grades: [{ trimester: 1, score: 9, is_reference_ten: false, created_at: "2026-10-15T12:00:00Z" }],
    peers: [
      { trimester: 1, score: 4 },
      { trimester: 1, score: 5 },
    ],
  });

  it("lists the late history: 2 days on phase 2 cost 1 point at 0.5 per day", () => {
    expect(summary.phaseRows.slice(0, 4).map((p) => p.daysLate)).toEqual([0, 2, 0, 0]);
    expect(summary.totalDaysLate).toBe(2);
    expect(summary.totalPenalty).toBe(1);
  });

  it("subtracts the late penalty from the teacher's bimestre grade (all late stages are in the 1º bimestre)", () => {
    expect(summary.bimesters[0]?.final).toBe(8);
    expect(summary.bimesters[1]?.final).toBeNull();
    expect(summary.finalAverage).toBe(8);
  });

  it("averages the AI score of evaluated phases and the peer scores per bimestre", () => {
    expect(summary.aiAverage).toBe(7.3);
    expect(summary.bimesters[0]?.peerAverage).toBe(4.5);
  });
});
