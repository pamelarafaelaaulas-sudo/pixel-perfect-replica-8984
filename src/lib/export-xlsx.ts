import type { buildExport, buildStudentGrades, NumberingRow } from "./export-rows";
import { AI_CRITERIA } from "./ai-score";

type Rows = ReturnType<typeof buildExport>;

const FONT = { name: "Arial", size: 10 };
const HEADER_FILL = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF1F4D45" } };

/** Builds the .xlsx in the browser (ExcelJS loaded on demand). Total uses a live formula. */
export async function buildWorkbook(rows: Rows, title: string): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "PamLab";
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
    { header: "Código do projeto", key: "projectCode", width: 16 },
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
      total: { formula: `IF(F${n}="","",MAX(0,F${n}-G${n}))`, result: r.total ?? "" },
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

type Col = { header: string; key: string; width: number; fmt?: string; wrap?: boolean };

async function newWorkbook(title: string) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "PamLab";
  wb.title = title;
  const used = new Set<string>();
  const addSheet = (rawName: string, cols: Col[]) => {
    const base = rawName.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 28) || "Planilha";
    let name = base;
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base} ${i}`;
    used.add(name.toLowerCase());
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
  const finish = async () => {
    const buf = await wb.xlsx.writeBuffer();
    return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  };
  return { addSheet, finish };
}

/**
 * First sheet "Todos os alunos" lists every student (full name, class, group, code, final grade per bimestre, average),
 * then one sheet per class that has students. Classes with no students yet are left out so the file never opens empty.
 */
export async function buildStudentGradesWorkbook(
  blocks: ReturnType<typeof buildStudentGrades>,
  bimesterTitles: string[],
): Promise<Blob> {
  const { addSheet, finish } = await newWorkbook("Notas dos alunos por turma");
  const colL = (n: number) => String.fromCharCode(64 + n);
  const gradeCols = bimesterTitles.map((t, i) => ({ header: t, key: `b${i}`, width: 14, fmt: "0.0" }));

  const fill = (
    ws: ReturnType<typeof addSheet>,
    first: number,
    rows: { r: (typeof blocks)[number]["rows"][number]; className: string }[],
  ) => {
    const last = first + bimesterTitles.length - 1;
    rows.forEach(({ r, className }, i) => {
      const n = i + 2;
      const filled = r.totals.filter((t): t is number => t !== null);
      const avg = filled.length ? Math.round((filled.reduce((s, x) => s + x, 0) / filled.length) * 10) / 10 : "";
      const range = `${colL(first)}${n}:${colL(last)}${n}`;
      ws.addRow({
        name: r.name,
        className,
        groupName: r.groupName,
        projectCode: r.projectCode,
        ...Object.fromEntries(r.totals.map((t, j) => [`b${j}`, t])),
        avg: { formula: `IF(COUNT(${range})=0,"",ROUND(AVERAGE(${range}),1))`, result: avg },
      });
    });
  };

  const all = addSheet("Todos os alunos", [
    { header: "Nome completo", key: "name", width: 34 },
    { header: "Turma", key: "className", width: 20 },
    { header: "Grupo", key: "groupName", width: 24 },
    { header: "Código do projeto", key: "projectCode", width: 16 },
    ...gradeCols,
    { header: "Média", key: "avg", width: 10, fmt: "0.0" },
  ]);
  const allRows = blocks.flatMap((b) => b.rows.map((r) => ({ r, className: b.className })));
  if (allRows.length) fill(all, 5, allRows);
  else all.addRow({ name: "Nenhum aluno entrou em um grupo ainda." });

  // Class sheets: the full calculation per bimestre (group grade, late penalty, teacher adjustment, final).
  for (const block of blocks) {
    if (!block.rows.length) continue;
    const ws = addSheet(block.className, [
      { header: "Nome completo", key: "name", width: 34 },
      { header: "Grupo", key: "groupName", width: 22 },
      { header: "Código do projeto", key: "projectCode", width: 14 },
      ...bimesterTitles.flatMap((t, i) => [
        { header: `${t} — nota do grupo`, key: `s${i}`, width: 12, fmt: "0.0" },
        { header: `${t} — desconto de atraso`, key: `p${i}`, width: 12, fmt: "0.0" },
        { header: `${t} — ajuste da professora`, key: `a${i}`, width: 12, fmt: "+0.0;-0.0;0.0" },
        { header: `${t} — nota final`, key: `f${i}`, width: 12, fmt: "0.0" },
      ]),
      { header: "Média final", key: "avg", width: 10, fmt: "0.0" },
    ]);
    ws.getRow(1).height = 48;
    block.rows.forEach((r, i) => {
      const n = i + 2;
      const finals = r.details.map((_, j) => `${colL(4 + j * 4 + 3)}${n}`).join(",");
      const filled = r.totals.filter((t): t is number => t !== null);
      const avg = filled.length ? Math.round((filled.reduce((s, x) => s + x, 0) / filled.length) * 10) / 10 : "";
      ws.addRow({
        name: r.name,
        groupName: r.groupName,
        projectCode: r.projectCode,
        ...Object.fromEntries(
          r.details.flatMap((d, j) => [
            [`s${j}`, d.score],
            [`p${j}`, d.score === null ? null : -d.penalty],
            [`a${j}`, d.score === null && d.adjustment === 0 ? null : d.adjustment],
            [`f${j}`, d.final],
          ]),
        ),
        avg: { formula: `IF(COUNT(${finals})=0,"",ROUND(AVERAGE(${finals}),1))`, result: avg },
      });
    });
  }
  return finish();
}

/** Single sheet with every project's number and code, in numbering order. */
export async function buildNumberingWorkbook(rows: NumberingRow[]): Promise<Blob> {
  const { addSheet, finish } = await newWorkbook("Numeração dos trabalhos");
  const ws = addSheet("Numeração", [
    { header: "Nº", key: "number", width: 6, fmt: "00" },
    { header: "Código do projeto", key: "projectCode", width: 18 },
    { header: "Turma", key: "className", width: 20 },
    { header: "Sigla", key: "classLabel", width: 8 },
    { header: "Grupo", key: "groupName", width: 26 },
    { header: "Área", key: "area", width: 22 },
    { header: "Integrantes", key: "members", width: 40, wrap: true },
  ]);
  for (const r of rows) ws.addRow(r);
  return finish();
}
