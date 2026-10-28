import { gradeAfterPenalty, type PhaseInfo } from "./penalty";
import { overallScore } from "./ai-score";

export type TrimesterRow = {
  trimester: number;
  score: number | null;
  final: number | null;
  reference: boolean;
  launchedAt: string | null;
  peerAverage: number | null;
  peerCount: number;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Everything the teacher reviews for one student in one group before launching a trimester.
 * Final trimester grade = teacher score minus the project's total late penalty (never below 0).
 */
export function studentSummary(args: {
  phases: PhaseInfo[];
  totalPenalty: number;
  aiByPhase: Record<number, number>;
  grades: { trimester: number; score: number; is_reference_ten: boolean; created_at: string }[];
  peers: { trimester: number; score: number }[];
}) {
  const phaseRows = args.phases.map((p) => ({ ...p, ai: args.aiByPhase[p.phase] ?? null }));
  const aiScores = phaseRows.map((p) => p.ai).filter((n): n is number => n !== null);
  const trimesters: TrimesterRow[] = [1, 2, 3].map((t) => {
    const g = args.grades.find((x) => x.trimester === t);
    const peerScores = args.peers.filter((p) => p.trimester === t).map((p) => Number(p.score));
    return {
      trimester: t,
      score: g ? Number(g.score) : null,
      final: g ? gradeAfterPenalty(Number(g.score), args.totalPenalty) : null,
      reference: g?.is_reference_ten ?? false,
      launchedAt: g?.created_at ?? null,
      peerAverage: peerScores.length ? round1(peerScores.reduce((s, n) => s + n, 0) / peerScores.length) : null,
      peerCount: peerScores.length,
    };
  });
  const finals = trimesters.map((t) => t.final).filter((n): n is number => n !== null);
  return {
    phaseRows,
    aiAverage: aiScores.length ? overallScore(aiScores) : null,
    totalDaysLate: phaseRows.reduce((s, p) => s + p.daysLate, 0),
    totalPenalty: args.totalPenalty,
    trimesters,
    finalAverage: finals.length ? round1(finals.reduce((s, n) => s + n, 0) / finals.length) : null,
  };
}
