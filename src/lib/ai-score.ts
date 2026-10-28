/** Client-safe helpers for the AI phase evaluation (no secrets, no SDK). */

export const AI_CRITERIA = [
  { key: "clarity", label: "Clareza" },
  { key: "organization", label: "Organização" },
  { key: "citations", label: "Citações e fontes" },
  { key: "phase_fit", label: "Adequação à etapa" },
] as const;

export type AiCriterionKey = (typeof AI_CRITERIA)[number]["key"];

export type AiEvaluation = {
  overall: number;
  criteria: { key: AiCriterionKey; label: string; score: number; comment: string }[];
  summary: string;
  tips: { clarity: string[]; organization: string[]; citations: string[] };
};

/** Keeps a criterion score inside 0–10 with one decimal. */
export function clampScore(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return Math.round(Math.min(10, Math.max(0, v)) * 10) / 10;
}

/** Overall AI grade = simple average of the criterion scores, one decimal. */
export function overallScore(scores: number[]): number {
  if (scores.length === 0) return 0;
  const avg = scores.reduce((s, n) => s + clampScore(n), 0) / scores.length;
  return Math.round(avg * 10) / 10;
}
