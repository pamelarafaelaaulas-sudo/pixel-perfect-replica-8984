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
