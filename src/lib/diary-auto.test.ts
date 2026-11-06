import { describe, expect, it } from "vitest";
import { diaryAutoResult, diaryDatesValid } from "./diary-auto";

const entry = (entry_date: string) => ({ entry_date, content: "Observamos os resultados do experimento.", kind: "registro" });
describe("automatic diary approval", () => {
  it("requires a date on every entry", () => {
    expect(diaryDatesValid([entry("2026-11-06"), entry("")], "2026-11-06")).toBe(false);
  });
  it("rejects nonexistent and future dates", () => {
    expect(diaryDatesValid([entry("2026-02-30")], "2026-11-06")).toBe(false);
    expect(diaryDatesValid([entry("2026-11-07")], "2026-11-06")).toBe(false);
  });
  it("approves historical dated records without waiting for the teacher", () => {
    expect(diaryDatesValid([entry("2026-01-10"), entry("2026-11-06")], "2026-11-06")).toBe(true);
    expect(diaryAutoResult(true, "Detalhem os próximos passos.")).toEqual({ status: "approved", ai_status: "complete", ai_feedback: "Detalhem os próximos passos." });
  });
  it("keeps dated diary approved when AI is unavailable", () => {
    expect(diaryAutoResult(true, null)).toEqual({ status: "approved", ai_status: "unavailable", ai_feedback: null });
  });
  it("does not allow AI advice to override missing dates", () => {
    expect(diaryAutoResult(false, "Bom registro.").status).toBe("changes_requested");
  });
});