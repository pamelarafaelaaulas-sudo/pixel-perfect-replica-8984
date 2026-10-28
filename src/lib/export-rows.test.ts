import { describe, expect, it } from "vitest";
import { buildExport, type ExportInput } from "./export-rows";

const now = new Date("2026-03-20T12:00:00Z");
const input: ExportInput = {
  classes: [
    {
      id: "c1",
      name: "2º ano B",
      late_penalty_per_day: 0.5,
      schedules: [{ phase_number: 1, due_date: "2026-03-01T23:59:00Z" }],
      groups: [
        {
          id: "g1",
          group_name: "Plantas",
          group_members: [
            { student_id: "s1", profiles: { name: "Bia" } },
            { student_id: "s2", profiles: { name: "Ana" } },
          ],
          // Stage 1 (1º bimestre) delivered 2 days late → 1,0 point off the 1º bimestre.
          projects: { current_phase: 2, phase_submissions: [{ phase_number: 1, submitted_at: "2026-03-03T10:00:00Z" }] },
          grades: [
            { trimester: 1, score: 8, feedback: "Bom tema", is_reference_ten: false, created_at: "2026-03-05T10:00:00Z" },
            { trimester: 2, score: 9, feedback: null, is_reference_ten: true, created_at: "2026-03-06T10:00:00Z" },
          ],
        },
      ],
    },
    { id: "c2", name: "1º ano A", late_penalty_per_day: 0.5, schedules: [], groups: [] },
  ],
  ai: [
    {
      id: "a1", group_id: "g1", phase_number: 1, requested_by: null, created_at: "2026-03-02T10:00:00Z", overall: 6,
      criteria: [], summary: "antiga", tips: {}, evaluated_text: "",
    },
    {
      id: "a2", group_id: "g1", phase_number: 1, requested_by: null, created_at: "2026-03-03T10:00:00Z", overall: 7.5,
      criteria: [{ key: "clarity", score: 8, comment: "" }], summary: "recente", tips: { clarity: ["Seja direto"] }, evaluated_text: "",
    },
    {
      id: "a3", group_id: "g1", phase_number: 8, requested_by: null, created_at: "2026-03-10T10:00:00Z", overall: 9,
      criteria: [], summary: "intro", tips: {}, evaluated_text: "",
    },
  ],
  peers: [
    { group_id: "g1", trimester: 1, evaluator_student_id: "s1", evaluated_student_id: "s2", score: 5, feedback: "Ajudou muito", created_at: "2026-03-07T10:00:00Z" },
    { group_id: "g1", trimester: 2, evaluator_student_id: "s2", evaluated_student_id: "s1", score: 3, feedback: null, created_at: "2026-03-08T10:00:00Z" },
  ],
};

describe("grades spreadsheet", () => {
  it("has one row per group and bimestre, with that bimestre's late discount and total", () => {
    const { grades } = buildExport(input, { now });
    expect(grades).toHaveLength(4);
    const b1 = grades[0]!;
    expect(b1.members).toBe("Ana, Bia");
    expect(b1.score).toBe(8);
    expect(b1.penalty).toBe(1);
    expect(b1.total).toBe(7);
    expect(b1.feedback).toBe("Bom tema");
    expect(grades[1]!.penalty).toBe(0);
    expect(grades[1]!.total).toBe(9);
    expect(grades[1]!.reference).toBe("Sim");
    expect(grades[2]!.score).toBeNull();
    expect(grades[2]!.total).toBeNull();
  });

  it("filters by class and bimestre", () => {
    expect(buildExport(input, { now, classId: "c2" }).grades).toEqual([]);
    const only2 = buildExport(input, { now, bimester: 2 });
    expect(only2.grades).toHaveLength(1);
    expect(only2.ai.map((r) => r.phase)).toEqual(["8. Introdução"]);
    expect(only2.peers.map((p) => p.score)).toEqual([3]);
  });
});

describe("AI and peer feedback sheets", () => {
  it("keeps only the latest AI evaluation of each stage and counts the attempts", () => {
    const { ai } = buildExport(input, { now });
    const tema = ai.find((r) => r.phase === "1. Tema")!;
    expect(tema.summary).toBe("recente");
    expect(tema.overall).toBe(7.5);
    expect(tema.attempts).toBe(2);
    expect(tema.tipsClarity).toBe("Seja direto");
  });

  it("names who evaluated whom", () => {
    const { peers } = buildExport(input, { now, bimester: 1 });
    expect(peers[0]).toMatchObject({ evaluator: "Bia", evaluated: "Ana", score: 5, feedback: "Ajudou muito" });
  });
});
