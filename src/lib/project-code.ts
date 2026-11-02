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
  groups: { id: string; created_at: string; area_code?: string | null }[];
};

/** Default area order when grouping by area: Biológicas, then Saúde, then the others. */
export const DEFAULT_AREA_ORDER: string[] = ["BIO", "SAU", ...AREAS.map((a) => a.code).filter((c) => c !== "BIO" && c !== "SAU")];

/**
 * Mirrors SQL `renumber_projects`: one shared count 1, 2, 3…
 * With `areaOrder`, projects are grouped by area in that order first (no/unknown area last);
 * then classes in the chosen order (unlisted ones after, by creation), then groups by registration.
 */
export function numberProjects(classes: NumberingClass[], order: string[], areaOrder?: string[] | null) {
  const pos = new Map(order.map((id, i) => [id, i]));
  const sorted = [...classes].sort((a, b) => {
    const pa = pos.get(a.id) ?? Infinity;
    const pb = pos.get(b.id) ?? Infinity;
    if (pa !== pb) return pa - pb;
    return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
  });
  const items = sorted.flatMap((c, ci) =>
    [...c.groups]
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
      .map((g, gi) => ({ g, ci, gi })),
  );
  if (areaOrder?.length) {
    const rank = (a: string | null | undefined) => {
      const i = a ? areaOrder.indexOf(a) : -1;
      return i < 0 ? Infinity : i;
    };
    items.sort((x, y) => rank(x.g.area_code) - rank(y.g.area_code) || x.ci - y.ci || x.gi - y.gi);
  }
  const result = new Map<string, number>();
  items.forEach(({ g }, i) => result.set(g.id, i + 1));
  return result;
}
