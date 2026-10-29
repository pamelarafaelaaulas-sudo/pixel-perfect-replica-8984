/** Research areas and their 3-letter abbreviations (first part of the project code). */
export const AREAS = [
  { code: "AGR", label: "Ciências Agrárias" },
  { code: "BIO", label: "Ciências Biológicas" },
  { code: "EXA", label: "Ciências Exatas" },
  { code: "HUM", label: "Ciências Humanas" },
  { code: "SOC", label: "Ciências Sociais" },
  { code: "SAU", label: "Ciências da Saúde" },
  { code: "ENG", label: "Engenharias" },
  { code: "LIN", label: "Linguagens e Artes" },
] as const;

export type AreaCode = (typeof AREAS)[number]["code"];

export function areaLabel(code: string | null | undefined) {
  return AREAS.find((a) => a.code === code)?.label ?? null;
}

/** Normalizes what the teacher types as the class label: uppercase letters/digits only, max 8. */
export function normalizeClassLabel(raw: string) {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

/**
 * Project code: AREA-CLASSLABEL-01. The number is one count per teacher across all her classes
 * (class order she chose, then group registration order), at least 2 digits.
 * Missing class label shows as "???" so the code is still recognizable; missing area or number → null.
 */
export function projectCode(
  area: string | null | undefined,
  classLabel: string | null | undefined,
  num: number | null | undefined,
) {
  if (!area || num == null) return null;
  const n = String(num).padStart(2, "0");
  return `${area}-${classLabel || "???"}-${n}`;
}

export type NumberingClass = {
  id: string;
  created_at: string;
  groups: { id: string; created_at: string }[];
};

/**
 * Mirrors SQL `renumber_projects`: classes in the chosen order (unlisted ones after, by creation),
 * groups by registration inside each class, numbered 1, 2, 3… in one shared count.
 */
export function numberProjects(classes: NumberingClass[], order: string[]) {
  const pos = new Map(order.map((id, i) => [id, i]));
  const sorted = [...classes].sort((a, b) => {
    const pa = pos.get(a.id) ?? Infinity;
    const pb = pos.get(b.id) ?? Infinity;
    if (pa !== pb) return pa - pb;
    return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
  });
  const result = new Map<string, number>();
  let n = 0;
  for (const c of sorted) {
    const groups = [...c.groups].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
    for (const g of groups) result.set(g.id, ++n);
  }
  return result;
}
