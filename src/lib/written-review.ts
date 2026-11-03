import { PHASES, isWrittenPart } from "./phases";

export { MIN_RESPONSE_CHARS, responseProblem } from "./banner-review";

/** Default time the group gets to send the new version of a written stage after the teacher's feedback. */
export const WRITTEN_REVIEW_DAYS = 7;

/** Written stages (4–12) the teacher can send back with feedback, once delivered. */
export const reviewableStage = (phase: number) => isWrittenPart(phase);

/** Bimestre a written stage's late new version is discounted from. */
export const stageBimester = (phase: number) => PHASES[phase - 1]?.bimester ?? 1;

type StageFields = {
  title?: string | null;
  institution?: string | null;
  area_subarea?: string | null;
  general_objective?: string | null;
  specific_objectives?: string | null;
  methodology?: string | null;
  introduction?: string | null;
  results_discussion?: string | null;
  conclusion?: string | null;
  references_list?: string | null;
  abstract?: string | null;
  keywords?: string | null;
};

/** Text of one written stage, the same snapshot SQL `written_phase_text` stores for each version. */
export function writtenPhaseText(p: StageFields, phase: number): string {
  const v = (x: string | null | undefined) => x ?? "";
  switch (phase) {
    case 4:
      return `Título: ${v(p.title)}\nInstituição: ${v(p.institution)}\nÁrea: ${v(p.area_subarea)}`;
    case 5:
      return v(p.general_objective);
    case 6:
      return v(p.specific_objectives);
    case 7:
      return v(p.methodology);
    case 8:
      return v(p.introduction);
    case 9:
      return v(p.results_discussion);
    case 10:
      return v(p.conclusion);
    case 11:
      return v(p.references_list);
    case 12:
      return `${v(p.abstract)}\n\nPalavras-chave: ${v(p.keywords)}`;
    default:
      return "";
  }
}

/** Spaces and line breaks don't count as a change (mirrors SQL `normalized_text`). */
export const normalizeText = (t: string | null | undefined) => (t ?? "").trim().replace(/\s+/g, " ");

/** Blocks a new version that is the same text the teacher reviewed. */
export function sameTextProblem(reviewed: string, current: string): string | null {
  return normalizeText(reviewed) === normalizeText(current)
    ? "O texto está idêntico à versão anterior. Faça as correções pedidas antes de reenviar."
    : null;
}

/** Improvement grade from the AI, kept between 0 and 10 with one decimal. */
export function clampImprovement(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.min(10, Math.max(0, n)) * 10) / 10;
}

/** Small line-level diff for showing the teacher what changed between two versions. */
export function lineDiff(before: string, after: string): { removed: string[]; added: string[] } {
  const lines = (t: string) => t.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const a = lines(before);
  const b = lines(after);
  const inB = new Set(b.map(normalizeText));
  const inA = new Set(a.map(normalizeText));
  return {
    removed: a.filter((l) => !inB.has(normalizeText(l))),
    added: b.filter((l) => !inA.has(normalizeText(l))),
  };
}
