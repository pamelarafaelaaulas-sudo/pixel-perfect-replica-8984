import { chartNumber, type StageChart } from "./stage-charts";

/** Browser-only chart rendering, shared by the editor and Word PNG export. */
export async function renderStageChart(canvas: HTMLCanvasElement, chart: StageChart) {
  const { Chart, registerables } = await import("chart.js");
  Chart.register(...registerables);
  const css = getComputedStyle(document.documentElement);
  const colors = Array.from({ length: 5 }, (_, i) => css.getPropertyValue(`--chart-${i + 1}`).trim());
  const foreground = css.getPropertyValue("--foreground").trim();
  const background = css.getPropertyValue("--background").trim();
  return new Chart(canvas, {
    type: chart.type,
    data: {
      labels: chart.points.map((p) => p.label),
      datasets: [{ label: chart.yLabel || chart.title, data: chart.points.map((p) => chartNumber(p.value)),
        backgroundColor: chart.type === "pie" ? chart.points.map((_, i) => colors[i % colors.length]) : colors[0],
        borderColor: chart.type === "pie" ? background : colors[1], borderWidth: 2 }],
    },
    options: {
      responsive: false, animation: false, devicePixelRatio: 2,
      plugins: { legend: { display: chart.type === "pie", labels: { color: foreground, font: { size: 15 } } } },
      scales: chart.type === "pie" ? {} : {
        x: { ticks: { color: foreground, font: { size: 15 } }, title: { display: !!chart.xLabel, text: chart.xLabel, color: foreground } },
        y: { beginAtZero: true, ticks: { color: foreground }, title: { display: !!chart.yLabel, text: chart.yLabel, color: foreground } },
      },
    },
    plugins: [{ id: "figureBackground", beforeDraw(instance) {
      const { ctx, width, height } = instance;
      ctx.save(); ctx.globalCompositeOperation = "destination-over"; ctx.fillStyle = background; ctx.fillRect(0, 0, width, height); ctx.restore();
    } }],
  });
}

export async function chartPng(chart: StageChart): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = 800; canvas.height = 450;
  const instance = await renderStageChart(canvas, chart);
  try {
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error("Não foi possível gerar a figura.")), "image/png"));
    return new Uint8Array(await blob.arrayBuffer());
  } finally { instance.destroy(); }
}