export const CHART_COLUMNS = {
  introduction: "introduction_charts",
  methodology: "methodology_charts",
  results_discussion: "results_charts",
} as const;
export type ChartColumn = (typeof CHART_COLUMNS)[keyof typeof CHART_COLUMNS];
export const CHART_COLUMN_LIST = Object.values(CHART_COLUMNS);
export function chartColumnOf(field: string): ChartColumn | null {
  return CHART_COLUMNS[field as keyof typeof CHART_COLUMNS] ?? null;
}
export type StageChart = {
  title: string; source: string; type: "bar" | "line" | "pie";
  xLabel: string; yLabel: string;
  points: { label: string; value: string }[];
};
export function emptyChart(): StageChart {
  return { title: "", source: "", type: "bar", xLabel: "", yLabel: "", points: [{ label: "", value: "" }, { label: "", value: "" }] };
}
export function parseCharts(value: unknown): StageChart[] {
  if (!Array.isArray(value)) return [];
  return value.filter((c) => c && typeof c === "object").map((c) => {
    const o = c as Record<string, unknown>;
    return {
      title: String(o["title"] ?? ""), source: String(o["source"] ?? ""),
      type: o["type"] === "line" || o["type"] === "pie" ? o["type"] : "bar",
      xLabel: String(o["xLabel"] ?? ""), yLabel: String(o["yLabel"] ?? ""),
      points: Array.isArray(o["points"]) ? o["points"].map((p) => ({ label: String(p?.label ?? ""), value: String(p?.value ?? "") })) : [],
    };
  });
}
export function chartNumber(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value.trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
export const figureCaption = (index: number, title: string) => `Figura ${index + 1} – ${title.trim() || "Sem título"}`;
export function chartProblems(chart: StageChart): string[] {
  const problems: string[] = [];
  if (!chart.title.trim()) problems.push("Escreva o título do gráfico.");
  if (!chart.points.length || chart.points.some((p) => !p.label.trim() || chartNumber(p.value) === null)) problems.push("Preencha as categorias e os valores numéricos.");
  if (chart.type === "pie" && (chart.points.some((p) => (chartNumber(p.value) ?? 0) < 0) || !chart.points.some((p) => (chartNumber(p.value) ?? 0) > 0))) problems.push("O gráfico de setores precisa de valores não negativos e um total maior que zero.");
  return problems;
}