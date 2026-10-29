import { describe, expect, it } from "vitest";
import { AREAS, normalizeClassLabel, numberProjects, projectCode } from "./project-code";

describe("project code", () => {
  it("uses the area, the class label and a 2-digit number starting at 01", () => {
    expect(projectCode("BIO", "2B", 1)).toBe("BIO-2B-01");
    expect(projectCode("SAU", "1A", 42)).toBe("SAU-1A-42");
  });

  it("keeps all digits past 99", () => {
    expect(projectCode("ENG", "3C", 100)).toBe("ENG-3C-100");
  });

  it("has no code until the area is chosen", () => {
    expect(projectCode(null, "2B", 5)).toBeNull();
  });

  it("marks a missing class label", () => {
    expect(projectCode("EXA", null, 7)).toBe("EXA-???-07");
  });

  it("uses the eight area abbreviations from the teacher", () => {
    expect(AREAS.map((a) => a.code)).toEqual(["AGR", "BIO", "EXA", "HUM", "SOC", "SAU", "ENG", "LIN"]);
  });

  it("cleans the class label", () => {
    expect(normalizeClassLabel("2º ano-b")).toBe("2ANOB");
    expect(normalizeClassLabel("turma123456")).toBe("TURMA123");
  });
});

describe("numbering across the teacher's classes", () => {
  const classes = [
    { id: "A", created_at: "2026-01-01", groups: [{ id: "a2", created_at: "2026-02-02" }, { id: "a1", created_at: "2026-02-01" }] },
    { id: "B", created_at: "2026-01-02", groups: [{ id: "b1", created_at: "2026-01-15" }] },
    { id: "C", created_at: "2026-01-03", groups: [{ id: "c1", created_at: "2026-01-10" }] },
  ];

  it("starts at 01 in the class she chose and keeps one count through the others", () => {
    const n = numberProjects(classes, ["B", "A", "C"]);
    expect(n.get("b1")).toBe(1);
    expect(n.get("a1")).toBe(2);
    expect(n.get("a2")).toBe(3);
    expect(n.get("c1")).toBe(4);
  });

  it("puts classes she didn't order after the chosen ones, oldest first", () => {
    const n = numberProjects(classes, ["C"]);
    expect([n.get("c1"), n.get("a1"), n.get("a2"), n.get("b1")]).toEqual([1, 2, 3, 4]);
  });
});
