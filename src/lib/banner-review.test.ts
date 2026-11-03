import { describe, expect, it } from "vitest";
import {
  BANNER_AXES,
  BANNER_CHECKLIST,
  bannerTotal,
  checklistComplete,
  clampAxis,
  criticalReasons,
  mermaidFromSteps,
  parseBannerFeedback,
  MIN_RESPONSE_CHARS,
  responseProblem,
} from "./banner-review";
import { bimesterPenalties, projectLateness, resubmitLateness } from "./penalty";

describe("banner AI matrix", () => {
  it("weights the four axes 3.5 / 2.5 / 2.0 / 2.0, adding up to 10", () => {
    expect(BANNER_AXES.map((a) => a.max)).toEqual([3.5, 2.5, 2, 2]);
    expect(BANNER_AXES.reduce((s, a) => s + a.max, 0)).toBe(10);
  });

  it("keeps each axis within its own maximum before adding", () => {
    expect(clampAxis("results", 5)).toBe(3.5);
    expect(clampAxis("abnt", -1)).toBe(0);
    expect(
      bannerTotal([
        { key: "results", score: 9 },
        { key: "abnt", score: 2 },
        { key: "methodology", score: 1.5 },
        { key: "design", score: 2 },
      ]),
    ).toBe(9);
  });
});

describe("banner checklist lock", () => {
  it("has the 5 required items and unlocks only when all are ticked", () => {
    expect(BANNER_CHECKLIST).toHaveLength(5);
    const four = Object.fromEntries(BANNER_CHECKLIST.slice(0, 4).map((i) => [i.key, true]));
    expect(checklistComplete(four)).toBe(false);
    const all = Object.fromEntries(BANNER_CHECKLIST.map((i) => [i.key, true]));
    expect(checklistComplete(all)).toBe(true);
  });
});

describe("critical attention filter", () => {
  const ok = parseBannerFeedback({ referencesFound: 3, templateOk: true, coherence: { aligned: true }, annotations: [] });
  it("flags banners with fewer than 3 references", () => {
    expect(criticalReasons(ok)).toEqual([]);
    expect(criticalReasons({ ...ok, referencesFound: 2 })).toContain("Menos de 3 referências");
  });
  it("flags template changes and incoherence with the written project", () => {
    expect(criticalReasons({ ...ok, templateOk: false })).toContain("Modelo oficial alterado");
    expect(criticalReasons({ ...ok, coherence: { aligned: false, divergences: [] } })).toContain("Diverge do projeto escrito");
  });
});

describe("late banner resubmission", () => {
  it("Nota final = Nota bruta − dias de atraso × desconto por dia", () => {
    const r = resubmitLateness(
      [{ resubmit_due_at: "2026-11-10T23:59:00-04:00", resubmitted_at: "2026-11-12T10:00:00-04:00" }],
      0.5,
    );
    expect(r.days).toBe(2);
    expect(r.penalty).toBe(1);
  });

  it("keeps counting while the new version has not arrived", () => {
    const r = resubmitLateness(
      [{ resubmit_due_at: "2026-11-10T23:59:00-04:00", resubmitted_at: null }],
      0.5,
      new Date("2026-11-13T12:00:00-04:00"),
    );
    expect(r.days).toBe(3);
    expect(r.penalty).toBe(1.5);
  });

  it("comes off only the banner bimestre (3º)", () => {
    const { phases } = projectLateness({
      currentPhase: 13,
      perDay: 0.5,
      now: new Date("2026-11-20T12:00:00Z"),
      schedules: [{ phase_number: 13, due_date: "2026-11-01T12:00:00Z" }],
      submissions: Array.from({ length: 13 }, (_, i) => ({ phase_number: i + 1, submitted_at: "2026-10-30T12:00:00Z" })),
      bannerReviews: [{ resubmit_due_at: "2026-11-05T12:00:00Z", resubmitted_at: "2026-11-07T12:00:00Z" }],
    });
    const pen = bimesterPenalties(phases);
    expect(pen[3]).toBe(1);
    expect(pen[1]).toBe(0);
    expect(pen[2]).toBe(0);
  });
});

describe("methodology flowchart", () => {
  it("builds Mermaid graph TD code from the steps", () => {
    expect(mermaidFromSteps(["Coletar água", "Medir pH"])).toBe('graph TD\n  P1["Coletar água"]\n  P2["Medir pH"]\n  P1 --> P2');
  });
});

describe("V2 written answer", () => {
  it("blocks sending a new version without the group's answer", () => {
    expect(responseProblem("")).not.toBeNull();
    expect(responseProblem("   ")).not.toBeNull();
  });
  it("requires at least 20 characters", () => {
    expect(MIN_RESPONSE_CHARS).toBe(20);
    expect(responseProblem("Mudamos o título")).not.toBeNull();
    expect(responseProblem("Incluímos a 3ª referência e aumentamos a fonte.")).toBeNull();
  });
});
