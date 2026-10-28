const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whole days late, rounded up. Anything after the deadline counts as at least one day.
 * Returns 0 when on time.
 */
export function daysLate(dueDate: string | Date, deliveredAt: string | Date | null, now: Date = new Date()): number {
  const due = new Date(dueDate).getTime();
  const delivered = deliveredAt ? new Date(deliveredAt).getTime() : now.getTime();
  const diff = delivered - due;
  if (diff <= 0) return 0;
  return Math.ceil(diff / DAY_MS);
}

/** Penalty in grade points for one phase. */
export function phasePenalty(days: number, perDay: number): number {
  return Math.round(days * perDay * 100) / 100;
}

/** Final grade after penalties, never below zero. */
export function gradeAfterPenalty(score: number, totalPenalty: number): number {
  return Math.max(0, Math.round((score - totalPenalty) * 100) / 100);
}

export function formatPoints(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}
