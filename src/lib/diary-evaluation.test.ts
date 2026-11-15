import { describe, expect, it } from "vitest";
import { diaryPhotosValidated, diaryPreliminaryScore, diaryStudentFeedback } from "./diary-evaluation";
describe("diary preliminary assessment", () => {
  it("keeps the preliminary grade on the 0–10 scale", () => {
    expect(diaryPreliminaryScore({ continuidade: 10, organizacao: 10, conteudo: 10, reflexao: 10 })).toBe(10);
    expect(diaryPreliminaryScore({ continuidade: 8, organizacao: 6, conteudo: 10, reflexao: 4 })).toBe(7);
  });
  it("validates only when every uploaded page is readable and has the matching date", () => {
    const p = { id: "a", readable: true, dated: true, date_matches: true, reason: "" };
    expect(diaryPhotosValidated(["a"], [p])).toBe(true);
    expect(diaryPhotosValidated(["a", "b"], [p])).toBe(false);
    expect(diaryPhotosValidated(["a"], [{ ...p, date_matches: false }])).toBe(false);
    expect(diaryPhotosValidated(["a"], [{ ...p, readable: false }])).toBe(false);
  });
  it("does not expose preliminary scores in student feedback", () => {
    expect(diaryStudentFeedback("Nota: 8,2. Descreva melhor os resultados.")).toBe("Descreva melhor os resultados.");
  });
});