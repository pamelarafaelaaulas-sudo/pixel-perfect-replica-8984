import { describe, expect, it } from "vitest";
import { buildNumberingRows, buildStudentGrades, type ExportInput } from "./export-rows";

const now = new Date("2026-06-01T12:00:00Z");
const far = "2027-01-01T00:00:00Z";

const classes: ExportInput["classes"] = [
  {
    id: "c2",
    name: "9B",
    code_label: "9B",
    late_penalty_per_day: 0.5,
    schedules: [],
    groups: [
      {
        id: "g2",
        group_name: "Grupo Água",
        group_members: [
          { student_id: "s3", profiles: { name: "Carla" } },
          { student_id: "s2", profiles: { name: "Bruno" } },
        ],
        projects: { current_phase: 1, area_code: "BIO", code_number: 2, phase_submissions: [] },
        grades: [{ trimester: 1, score: 8, feedback: null, is_reference_ten: false, created_at: far }],
      },
    ],
  },
  {
    id: "c1",
    name: "9A",
    code_label: "9A",
    late_penalty_per_day: 0.5,
    schedules: [{ phase_number: 1, due_date: "2026-05-29T12:00:00Z" }],
    groups: [
      {
        id: "g1",
        group_name: "Grupo Solo",
        group_members: [{ student_id: "s1", profiles: { name: "Ana" } }],
        projects: { current_phase: 1, area_code: "AGR", code_number: 1, phase_submissions: [] },
        grades: [{ trimester: 1, score: 9, feedback: null, is_reference_ten: false, created_at: far }],
      },
    ],
  },
];

describe("student grades spreadsheet", () => {
  it("adds the teacher's adjustment for that student only, after the late discount", () => {
    const withAdj: ExportInput["classes"] = [
      {
        ...classes[1]!,
        groups: [
          {
            ...classes[1]!.groups![0]!,
            group_members: [
              { student_id: "s1", profiles: { name: "Ana" } },
              { student_id: "s4", profiles: { name: "Davi" } },
            ],
            student_grade_adjustments: [{ student_id: "s1", bimester: 1, points: 1, note: "Participação" }],
          },
        ],
      },
    ];
    const [block] = buildStudentGrades(withAdj, now);
    // 9 − 1.5 (3 days late × 0.5) + 1 = 8.5 for Ana; Davi keeps 7.5
    expect(block!.rows.find((r) => r.name === "Ana")!.totals[0]).toBe(8.5);
    expect(block!.rows.find((r) => r.name === "Ana")!.details[0]).toEqual({ score: 9, penalty: 1.5, adjustment: 1, final: 8.5 });
    expect(block!.rows.find((r) => r.name === "Davi")!.totals[0]).toBe(7.5);
  });

  it("has one block per class, sorted by class name, with each student's name", () => {
    const blocks = buildStudentGrades(classes, now);
    expect(blocks.map((b) => b.className)).toEqual(["9A", "9B"]);
    expect(blocks[1]!.rows.map((r) => r.name)).toEqual(["Bruno", "Carla"]);
  });

  it("gives each student the group's grade minus that bimestre's late discount, empty when not launched", () => {
    const blocks = buildStudentGrades(classes, now);
    // Ana's group is 3 days late on stage 1 (B1) at 0.5/day → 9 − 1.5
    expect(blocks[0]!.rows[0]!.totals).toEqual([7.5, null, null, null]);
    expect(blocks[1]!.rows[0]!.totals).toEqual([8, null, null, null]);
    expect(blocks[1]!.rows[0]!.projectCode).toBe("BIO-9B-02");
  });
});

describe("numbering spreadsheet", () => {
  it("lists projects in number order with their code", () => {
    const rows = buildNumberingRows(classes, () => "Área");
    expect(rows.map((r) => [r.number, r.projectCode])).toEqual([
      [1, "AGR-9A-01"],
      [2, "BIO-9B-02"],
    ]);
    expect(rows[1]!.members).toBe("Bruno, Carla");
  });
});
