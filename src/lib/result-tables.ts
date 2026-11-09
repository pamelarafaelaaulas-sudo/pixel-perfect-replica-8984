/** ABNT tables in "Resultados e discussão". First row is the header. Not counted in word limits. */
export type ResultTable = { title: string; source: string; rows: string[][] };

/** Text field → column holding its tables, in document order. */
export const TABLE_COLUMNS = {
  introduction: "introduction_tables",
  methodology: "methodology_tables",
  results_discussion: "results_tables",
} as const;
export type TableField = keyof typeof TABLE_COLUMNS;
export type TableColumn = (typeof TABLE_COLUMNS)[TableField];
export const TABLE_COLUMN_LIST = Object.values(TABLE_COLUMNS) as TableColumn[];
export const tableColumnOf = (field: string): TableColumn | null => (TABLE_COLUMNS as Record<string, TableColumn>)[field] ?? null;

export const MAX_TABLE_ROWS = 30;
export const MAX_TABLE_COLS = 8;

export function emptyTable(rows = 3, cols = 3): ResultTable {
  return { title: "", source: "", rows: Array.from({ length: rows }, () => Array(cols).fill("")) };
}

export function parseTables(value: unknown): ResultTable[] {
  if (!Array.isArray(value)) return [];
  return value.map((t) => {
    const o = (t ?? {}) as Record<string, unknown>;
    const rows = Array.isArray(o["rows"]) ? (o["rows"] as unknown[]) : [];
    const grid = rows.map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? "")) : []));
    const cols = Math.max(1, ...grid.map((r) => r.length));
    return {
      title: String(o["title"] ?? ""),
      source: String(o["source"] ?? ""),
      rows: (grid.length ? grid : [[""]]).map((r) => [...r, ...Array(cols - r.length).fill("")]),
    };
  });
}

/** ABNT caption: "Tabela 1 – Título". */
export const tableCaption = (i: number, title: string) => `Tabela ${i + 1} – ${title.trim() || "Sem título"}`;
/** ABNT source line; defaults to the group's own data. */
export const tableSource = (source: string) => `Fonte: ${source.trim() || "Elaborado pelos autores"}.`.replace(/\.\.$/, ".");

/** Problems blocking delivery: every table needs a title and some content. */
export function tableProblems(tables: ResultTable[]): string[] {
  const out: string[] = [];
  tables.forEach((t, i) => {
    if (!t.title.trim()) out.push(`Tabela ${i + 1}: escreva o título.`);
    if (!t.rows.slice(1).some((r) => r.some((c) => c.trim()))) out.push(`Tabela ${i + 1}: preencha os dados.`);
  });
  return out;
}

export const addRow = (t: ResultTable): ResultTable =>
  t.rows.length >= MAX_TABLE_ROWS ? t : { ...t, rows: [...t.rows, Array(t.rows[0]?.length ?? 1).fill("")] };
export const addCol = (t: ResultTable): ResultTable =>
  (t.rows[0]?.length ?? 0) >= MAX_TABLE_COLS ? t : { ...t, rows: t.rows.map((r) => [...r, ""]) };
export const removeRow = (t: ResultTable, i: number): ResultTable =>
  t.rows.length <= 2 || i === 0 ? t : { ...t, rows: t.rows.filter((_, k) => k !== i) };
export const removeCol = (t: ResultTable, j: number): ResultTable =>
  (t.rows[0]?.length ?? 0) <= 1 ? t : { ...t, rows: t.rows.map((r) => r.filter((_, k) => k !== j)) };

/** Pasted text from Excel/Sheets (tabs) or a Markdown table (pipes) → grid. */
export function parsePastedTable(text: string): string[][] | null {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (!lines.length) return null;
  const pipes = lines.every((l) => l.includes("|"));
  if (!pipes && !lines.some((l) => l.includes("\t"))) return null;
  const rows = lines
    .filter((l) => !(pipes && /^\s*\|?[\s:|-]+\|?\s*$/.test(l)))
    .map((l) => (pipes ? l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|") : l.split("\t")).map((c) => c.trim()));
  const cols = Math.min(MAX_TABLE_COLS, Math.max(...rows.map((r) => r.length)));
  return rows.slice(0, MAX_TABLE_ROWS).map((r) => [...r, ...Array(cols).fill("")].slice(0, cols));
}
