import { bimesterPenalties, finalGrade, type PhaseInfo } from "./penalty";
import { overallScore } from "./ai-score";
import { BIMESTER_NUMBERS } from "./phases";

export type BimesterRow = {
  bimester: number;
  score: number | null;
  /** Late penalty of this bimestre's stages only. */
  penalty: number;
  /** Teacher's adjustment for this student only (+/−). */
  adjustment: number;
  adjustmentNote: string | null;
  final: number | null;
  reference: boolean;
  launchedAt: string | null;
  peerAverage: number | null;
  peerCount: number;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Everything the teacher reviews for one student in one group before launching a bimestre.
 * Final bimestre grade = teacher score − the late penalty of that bimestre's stages + this student's adjustment (0 to 10).
 * Grade and peer rows carry the bimestre in their `trimester` field (database column name).
 */
export function studentSummary(args: {
  phases: PhaseInfo[];
  totalPenalty: number;
  aiByPhase: Record<number, number>;
  grades: { trimester: number; score: number; is_reference_ten: boolean; created_at: string }[];
  peers: { trimester: number; score: number }[];
  adjustments?: { bimester: number; points: number; note: string | null }[];
}) {
  const phaseRows = args.phases.map((p) => ({ ...p, ai: args.aiByPhase[p.phase] ?? null }));
  const aiScores = phaseRows.map((p) => p.ai).filter((n): n is number => n !== null);
  const penalties = bimesterPenalties(args.phases);
  const bimesters: BimesterRow[] = BIMESTER_NUMBERS.map((b) => {
    const g = args.grades.find((x) => x.trimester === b);
    const peerScores = args.peers.filter((p) => p.trimester === b).map((p) => Number(p.score));
    const penalty = penalties[b] ?? 0;
    const adj = (args.adjustments ?? []).find((a) => a.bimester === b);
    const adjustment = adj ? Number(adj.points) : 0;
    return {
      bimester: b,
      score: g ? Number(g.score) : null,
      penalty,
      adjustment,
      adjustmentNote: adj?.note ?? null,
      final: g ? finalGrade(Number(g.score), penalty, adjustment) : null,
      reference: g?.is_reference_ten ?? false,
      launchedAt: g?.created_at ?? null,
      peerAverage: peerScores.length ? round1(peerScores.reduce((s, n) => s + n, 0) / peerScores.length) : null,
      peerCount: peerScores.length,
    };
  });
  const finals = bimesters.map((t) => t.final).filter((n): n is number => n !== null);
  return {
    phaseRows,
    aiAverage: aiScores.length ? overallScore(aiScores) : null,
    totalDaysLate: phaseRows.reduce((s, p) => s + p.daysLate, 0),
    totalPenalty: args.totalPenalty,
    bimesters,
    finalAverage: finals.length ? round1(finals.reduce((s, n) => s + n, 0) / finals.length) : null,
  };
}
