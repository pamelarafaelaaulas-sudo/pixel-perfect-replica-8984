import { describe, expect, it } from "vitest";
import { bimesterReport } from "./bimester";
import { bimesterPenalties, projectLateness } from "./penalty";
import { bimesterPhases } from "./phases";

const now = new Date("2026-03-20T12:00:00Z");
// Stage 1 (1º bimestre) and stage 8 (2º bimestre) have passed deadlines.
const schedules = [
  { phase_number: 1, due_date: "2026-03-01T23:59:00Z" },
  { phase_number: 8, due_date: "2026-03-10T23:59:00Z" },
  { phase_number: 13, due_date: "2026-03-15T23:59:00Z" },
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
        // Stage 1 delivered 2 days late → 1,0 point off the 1º bimestre only.
        // Stage 8 delivered 4 days late → 2,0 points off the 2º bimestre only.
        projects: {
          current_phase: 9,
          phase_submissions: [
            { phase_number: 1, submitted_at: "2026-03-03T10:00:00Z" },
            { phase_number: 8, submitted_at: "2026-03-14T10:00:00Z" },
          ],
        },
        grades: [
          { trimester: 1, score: 8, feedback: null, is_reference_ten: false },
          { trimester: 2, score: 1.5, feedback: null, is_reference_ten: false },
          { trimester: 4, score: 9, feedback: null, is_reference_ten: false },
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

describe("4 bimestres", () => {
  it("grades Tema–Metodologia in the 1º, Introdução–Resumo in the 2º and the banner in the 3º", () => {
    expect(bimesterPhases(1)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(bimesterPhases(2)).toEqual([8, 9, 10, 11, 12]);
    expect(bimesterPhases(3)).toEqual([13]);
    expect(bimesterPhases(4)).toEqual([]);
  });

  it("takes a stage's late penalty only from its own bimestre", () => {
    const { phases } = projectLateness({
      currentPhase: 13,
      schedules,
      perDay: 0.5,
      now,
      submissions: [
        { phase_number: 1, submitted_at: "2026-03-03T10:00:00Z" }, // 2 days
        { phase_number: 8, submitted_at: "2026-03-14T10:00:00Z" }, // 4 days
      ],
    });
    // Banner (stage 13) is open 5 days past its deadline → 2,5 off the 3º bimestre.
    expect(bimesterPenalties(phases)).toEqual({ 1: 1, 2: 2, 3: 2.5, 4: 0 });
  });
});

describe("bimestre report", () => {
  it("subtracts only that bimestre's late penalty from the launched grade", () => {
    const [c] = bimesterReport(classes, 1, now);
    const plantas = c!.rows.find((r) => r.groupId === "g1")!;
    expect(plantas.score).toBe(8);
    expect(plantas.penalty).toBe(1);
    expect(plantas.total).toBe(7);
  });

  it("never lets the total go below zero", () => {
    const [c] = bimesterReport(classes, 2, now);
    const plantas = c!.rows.find((r) => r.groupId === "g1")!;
    expect(plantas.penalty).toBe(2);
    expect(plantas.total).toBe(0);
  });

  it("has no late penalty in the 4º bimestre (feira)", () => {
    const [c] = bimesterReport(classes, 4, now);
    const plantas = c!.rows.find((r) => r.groupId === "g1")!;
    expect(plantas.penalty).toBe(0);
    expect(plantas.total).toBe(9);
  });

  it("leaves groups without a launched grade without a total", () => {
    const [c] = bimesterReport(classes, 1, now);
    const agua = c!.rows.find((r) => r.groupId === "g2")!;
    expect(agua.score).toBeNull();
    expect(agua.total).toBeNull();
    expect(c!.launched).toBe(1);
  });
});
