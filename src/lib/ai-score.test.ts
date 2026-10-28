import { describe, expect, it } from "vitest";
import { clampScore, overallScore } from "./ai-score";

describe("AI phase evaluation score", () => {
  it("keeps each criterion between 0 and 10", () => {
    expect(clampScore(12)).toBe(10);
    expect(clampScore(-3)).toBe(0);
    expect(clampScore(7.26)).toBe(7.3);
  });

  it("uses the average of the criteria as the overall grade", () => {
    expect(overallScore([8, 6, 4, 10])).toBe(7);
    expect(overallScore([7, 8, 8, 8])).toBe(7.8);
  });
});

import { latestPerPhase, parseSavedEvaluation } from "./ai-score";

describe("saved AI evaluations per phase", () => {
  const row = (id: string, phase: number, created: string, overall: number) =>
    parseSavedEvaluation({
      id,
      phase_number: phase,
      requested_by: null,
      created_at: created,
      overall,
      criteria: [],
      summary: "",
      tips: {},
      evaluated_text: "",
    });

  it("shows the teacher the most recent evaluation of each phase and counts the attempts", () => {
    const byPhase = latestPerPhase([
      row("a", 1, "2026-10-01T10:00:00Z", 5),
      row("b", 1, "2026-10-03T10:00:00Z", 7.5),
      row("c", 2, "2026-10-02T10:00:00Z", 6),
    ]);
    expect(byPhase[1]?.latest.id).toBe("b");
    expect(byPhase[1]?.count).toBe(2);
    expect(byPhase[2]?.latest.overall).toBe(6);
    expect(byPhase[3]).toBeUndefined();
  });
});
