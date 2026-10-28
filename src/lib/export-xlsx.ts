import type { buildExport } from "./export-rows";
import { AI_CRITERIA } from "./ai-score";

type Rows = ReturnType<typeof buildExport>;

const FONT = { name: "Arial", size: 10 };
const HEADER_FILL = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF1F4D45" } };

/** Builds the .xlsx in the browser (ExcelJS loaded on demand). Total uses a live formula. */
export async function buildWorkbook(rows: Rows, title: string): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Caderno de Projetos";
  wb.title = title;

  const sheet = (name: string, cols: { header: string; key: string; width: number; fmt?: string; wrap?: boolean }[]) => {
    const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = cols.map((c) => ({
      header: c.header,
      key: c.key,
      width: c.width,
      style: { font: FONT, ...(c.fmt ? { numFmt: c.fmt } : {}), alignment: { vertical: "top" as const, wrapText: !!c.wrap } },
    }));
    const head = ws.getRow(1);
    head.font = { ...FONT, bold: true, color: { argb: "FFFFFFFF" } };
    head.fill = HEADER_FILL;
    head.alignment = { vertical: "middle", wrapText: true };
    head.height = 28;
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
    return ws;
  };

  const grades = sheet("Notas", [
    { header: "Turma", key: "className", width: 18 },
    { header: "Grupo", key: "groupName", width: 22 },
    { header: "Integrantes", key: "members", width: 32, wrap: true },
    { header: "Bimestre", key: "bimester", width: 34 },
    { header: "Nota lançada (0–10)", key: "score", width: 12, fmt: "0.0" },
    { header: "Desconto de atraso", key: "penalty", width: 12, fmt: "0.0" },
    { header: "Total", key: "total", width: 10, fmt: "0.0" },
    { header: "Referência nota 10", key: "reference", width: 12 },
    { header: "Comentário da professora", key: "feedback", width: 50, wrap: true },
    { header: "Lançada em", key: "launchedAt", width: 14, fmt: "dd/mm/yyyy" },
  ]);
  rows.grades.forEach((r, i) => {
    const n = i + 2;
    grades.addRow({
      ...r,
      score: r.score ?? null,
      total: { formula: `IF(E${n}="","",MAX(0,E${n}-F${n}))`, result: r.total ?? "" },
      launchedAt: r.launchedAt ?? null,
    });
  });

  const ai = sheet("Avaliação da IA", [
    { header: "Turma", key: "className", width: 18 },
    { header: "Grupo", key: "groupName", width: 22 },
    { header: "Bimestre", key: "bimester", width: 34 },
    { header: "Etapa", key: "phase", width: 24 },
    { header: "Nota da IA", key: "overall", width: 10, fmt: "0.0" },
    ...AI_CRITERIA.map((c, i) => ({ header: c.label, key: `c${i}`, width: 12, fmt: "0.0" })),
    { header: "Resumo da IA", key: "summary", width: 50, wrap: true },
    { header: "Dicas de clareza", key: "tipsClarity", width: 40, wrap: true },
    { header: "Dicas de organização", key: "tipsOrganization", width: 40, wrap: true },
    { header: "Dicas de citações", key: "tipsCitations", width: 40, wrap: true },
    { header: "Avaliada em", key: "evaluatedAt", width: 14, fmt: "dd/mm/yyyy" },
    { header: "Tentativas", key: "attempts", width: 10 },
  ]);
  for (const r of rows.ai) ai.addRow({ ...r, ...Object.fromEntries(r.criteria.map((s, i) => [`c${i}`, s])) });

  const peers = sheet("Avaliação entre colegas", [
    { header: "Turma", key: "className", width: 18 },
    { header: "Grupo", key: "groupName", width: 22 },
    { header: "Bimestre", key: "bimester", width: 34 },
    { header: "Quem avaliou", key: "evaluator", width: 24 },
    { header: "Avaliado(a)", key: "evaluated", width: 24 },
    { header: "Nota (1–5)", key: "score", width: 10 },
    { header: "Comentário (confidencial)", key: "feedback", width: 50, wrap: true },
    { header: "Data", key: "createdAt", width: 14, fmt: "dd/mm/yyyy" },
  ]);
  for (const r of rows.peers) peers.addRow(r);

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
