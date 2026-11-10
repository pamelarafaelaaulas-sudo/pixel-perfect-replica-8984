import { describe, expect, it } from "vitest";
import { chartColumnOf, chartNumber, parseCharts } from "./stage-charts";
import { phaseFields } from "./phases";
import { buildAbntModel, buildPlanModel, type AbntInput } from "./abnt-doc";

const chart = { title: "Crescimento", type: "bar", points: [{ label: "Dia 1", value: "2,5" }], source: "Grupo", xLabel: "Dia", yLabel: "cm" };
const input: AbntInput = { title: "Teste", institution: "Escola", abstract: "", keywords: "", general_objective: "", specific_objectives: "", methodology: "Método", introduction: "Texto", results_discussion: "Resultados", conclusion: "", references_list: "", authors: [], teacherName: null, areaLabel: null, projectCode: null, year: 2026, introduction_charts: [chart], methodology_charts: [chart], results_charts: [chart] };
describe("Stage charts", () => {
  it.each([[7, "methodology", "methodology_charts"], [8, "introduction", "introduction_charts"], [9, "results_discussion", "results_charts"]] as const)("stores figures in stage %i", (phase, field, column) => {
    expect(chartColumnOf(field)).toBe(column);
    expect(phaseFields(phase)).toContain(column);
  });
  it("reads decimal commas without treating empty data as zero", () => {
    expect(chartNumber("2,5")).toBe(2.5); expect(chartNumber("")).toBeNull(); expect(chartNumber("abc")).toBeNull();
  });
  it("preserves saved chart data", () => { expect(parseCharts([chart])).toEqual([chart]); });
  it("exports figures in document order with their source", () => {
    const figures = buildAbntModel(input).sections.flatMap((s) => s.figures ?? []);
    expect(figures.map((f) => f.caption)).toEqual(["Figura 1 – Crescimento", "Figura 2 – Crescimento", "Figura 3 – Crescimento"]);
    expect(figures[0]?.source).toBe("Fonte: Grupo.");
    expect(figures[0]?.chart.points[0]?.value).toBe("2,5");
  });
  it("includes methodology figures in the project plan", () => {
    const plan = buildPlanModel({ ...input, theme: "Tema", guiding_question: "Pergunta", social_application: "Intervenção", scientific_articles: [] });
    expect(plan.sections.at(-1)?.figures?.[0]?.caption).toBe("Figura 1 – Crescimento");
  });
});