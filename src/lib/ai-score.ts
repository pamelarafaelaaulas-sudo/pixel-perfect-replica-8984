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

export type SavedAiEvaluation = AiEvaluation & {
  id: string;
  phaseNumber: number;
  requestedBy: string | null;
  createdAt: string;
  evaluatedText: string;
};

const strList = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x ?? "")).filter(Boolean) : []);

/** Turns a stored ai_evaluations row back into the shape the screens render. */
export function parseSavedEvaluation(row: {
  id: string;
  phase_number: number;
  requested_by: string | null;
  created_at: string;
  overall: number | string;
  criteria: unknown;
  summary: string;
  tips: unknown;
  evaluated_text: string;
}): SavedAiEvaluation {
  const rawCriteria = Array.isArray(row.criteria) ? (row.criteria as Record<string, unknown>[]) : [];
  const criteria = AI_CRITERIA.map((c) => {
    const found = rawCriteria.find((x) => x?.["key"] === c.key) ?? {};
    return { key: c.key, label: c.label, score: clampScore(Number(found["score"])), comment: String(found["comment"] ?? "") };
  });
  const tips = (row.tips ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    phaseNumber: row.phase_number,
    requestedBy: row.requested_by,
    createdAt: row.created_at,
    evaluatedText: row.evaluated_text,
    overall: clampScore(Number(row.overall)),
    criteria,
    summary: row.summary,
    tips: { clarity: strList(tips["clarity"]), organization: strList(tips["organization"]), citations: strList(tips["citations"]) },
  };
}

/** Most recent evaluation for each phase, plus how many times each phase was evaluated. */
export function latestPerPhase(rows: SavedAiEvaluation[]): Record<number, { latest: SavedAiEvaluation; count: number }> {
  const out: Record<number, { latest: SavedAiEvaluation; count: number }> = {};
  for (const r of rows) {
    const cur = out[r.phaseNumber];
    if (!cur) out[r.phaseNumber] = { latest: r, count: 1 };
    else {
      cur.count += 1;
      if (new Date(r.createdAt) > new Date(cur.latest.createdAt)) cur.latest = r;
    }
  }
  return out;
}
