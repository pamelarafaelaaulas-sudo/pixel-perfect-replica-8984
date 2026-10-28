import { describe, expect, it } from "vitest";
import { AREAS, normalizeClassLabel, projectCode } from "./project-code";

describe("project code", () => {
  it("uses the area, the class label and a 3-digit number", () => {
    expect(projectCode("BIO", "2B", 1)).toBe("BIO-2B-001");
    expect(projectCode("SAU", "1A", 42)).toBe("SAU-1A-042");
  });

  it("keeps all digits past 999", () => {
    expect(projectCode("ENG", "3C", 1000)).toBe("ENG-3C-1000");
  });

  it("has no code until the area is chosen", () => {
    expect(projectCode(null, "2B", 5)).toBeNull();
  });

  it("marks a missing class label", () => {
    expect(projectCode("EXA", null, 7)).toBe("EXA-???-007");
  });

  it("uses the eight area abbreviations from the teacher", () => {
    expect(AREAS.map((a) => a.code)).toEqual(["AGR", "BIO", "EXA", "HUM", "SOC", "SAU", "ENG", "LIN"]);
  });

  it("cleans the class label", () => {
    expect(normalizeClassLabel("2º ano-b")).toBe("2ANOB");
    expect(normalizeClassLabel("turma123456")).toBe("TURMA123");
  });
});
