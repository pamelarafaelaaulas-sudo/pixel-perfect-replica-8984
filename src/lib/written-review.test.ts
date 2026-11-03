import { describe, expect, it } from "vitest";
import { WRITTEN_REVIEW_DAYS, clampImprovement, lineDiff, reviewableStage, sameTextProblem, stageBimester, writtenPhaseText } from "./written-review";
import { bimesterPenalties, projectLateness } from "./penalty";

describe("written stage feedback rounds", () => {
  it("applies to the written parts 4–12 only, not planning or the banner", () => {
    expect([3, 4, 12, 13].map(reviewableStage)).toEqual([false, true, true, false]);
  });

  it("gives the group one week by default", () => {
    expect(WRITTEN_REVIEW_DAYS).toBe(7);
  });

  it("refuses a new version with the same text, ignoring extra spaces and line breaks", () => {
    expect(sameTextProblem("Texto da  metodologia.\n", " Texto da metodologia.")).not.toBeNull();
    expect(sameTextProblem("Texto da metodologia.", "Texto da metodologia revisado.")).toBeNull();
  });

  it("snapshots the abstract with its keywords and the title with institution and area", () => {
    expect(writtenPhaseText({ abstract: "Resumo", keywords: "a; b; c" }, 12)).toBe("Resumo\n\nPalavras-chave: a; b; c");
    expect(writtenPhaseText({ title: "T", institution: null, area_subarea: "Bio" }, 4)).toBe("Título: T\nInstituição: \nÁrea: Bio");
  });

  it("keeps the AI improvement grade between 0 and 10", () => {
    expect(clampImprovement(12)).toBe(10);
    expect(clampImprovement(-3)).toBe(0);
    expect(clampImprovement(7.46)).toBe(7.5);
  });

  it("lists added and removed lines", () => {
    expect(lineDiff("a\nb", "a\nc")).toEqual({ removed: ["b"], added: ["c"] });
  });
});

describe("late new version of a written stage", () => {
  const schedules = [
    { phase_number: 7, due_date: "2026-03-01T23:59:00Z" },
    { phase_number: 8, due_date: "2026-05-01T23:59:00Z" },
  ];
  const submissions = [
    { phase_number: 7, submitted_at: "2026-03-01T10:00:00Z" },
    { phase_number: 8, submitted_at: "2026-05-01T10:00:00Z" },
  ];

  it("discounts days late × per-day value from the stage's own bimestre", () => {
    const { phases } = projectLateness({
      currentPhase: 9,
      schedules,
      submissions,
      perDay: 0.5,
      writtenReviews: [
        // Metodologia (1º bim.): 2 days late; Introdução (2º bim.): on time.
        { phase_number: 7, resubmit_due_at: "2026-03-10T23:59:00Z", resubmitted_at: "2026-03-12T20:00:00Z" },
        { phase_number: 8, resubmit_due_at: "2026-05-10T23:59:00Z", resubmitted_at: "2026-05-09T20:00:00Z" },
      ],
      now: new Date("2026-06-01T00:00:00Z"),
    });
    expect(phases[6]!.penalty).toBe(1);
    expect(phases[7]!.penalty).toBe(0);
    const p = bimesterPenalties(phases);
    expect(p[1]).toBe(1);
    expect(p[2]).toBe(0);
    expect(stageBimester(7)).toBe(1);
  });

  it("keeps counting while the new version is still missing", () => {
    const { phases } = projectLateness({
      currentPhase: 9,
      schedules,
      submissions,
      perDay: 0.5,
      writtenReviews: [{ phase_number: 8, resubmit_due_at: "2026-05-10T23:59:00Z", resubmitted_at: null }],
      now: new Date("2026-05-13T12:00:00Z"),
    });
    expect(phases[7]!.penalty).toBe(1.5);
  });
});
