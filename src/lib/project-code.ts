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
 * Project code: AREA-CLASSLABEL-000. The number is the site-wide registration order.
 * Missing class label shows as "???" so the code is still recognizable; missing area or number → null.
 */
export function projectCode(
  area: string | null | undefined,
  classLabel: string | null | undefined,
  seq: number | null | undefined,
) {
  if (!area || seq == null) return null;
  const n = String(seq).padStart(3, "0");
  return `${area}-${classLabel || "???"}-${n}`;
}
