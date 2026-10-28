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

export type PhaseState = "delivered" | "in_progress" | "upcoming" | "skipped";

export type PhaseInfo = {
  phase: number;
  dueDate: string | null;
  submittedAt: string | null;
  state: PhaseState;
  daysLate: number;
  penalty: number;
};

/**
 * Lateness for each of the 4 phases of a project.
 * Delivered phases count days between deadline and delivery.
 * Undelivered phases (current or future) keep accruing days once the deadline passes.
 */
export function projectLateness(args: {
  currentPhase: number;
  schedules: { phase_number: number; due_date: string }[];
  submissions: { phase_number: number; submitted_at: string }[];
  perDay: number;
  now?: Date;
}): { phases: PhaseInfo[]; totalPenalty: number } {
  const now = args.now ?? new Date();
  const phases: PhaseInfo[] = [1, 2, 3, 4].map((phase) => {
    const due = args.schedules.find((s) => s.phase_number === phase)?.due_date ?? null;
    const sub = args.submissions.find((s) => s.phase_number === phase)?.submitted_at ?? null;
    let state: PhaseState;
    if (sub) state = "delivered";
    else if (phase === args.currentPhase) state = "in_progress";
    else if (phase > args.currentPhase) state = "upcoming";
    else state = "skipped";
    const days = !due || state === "skipped" ? 0 : daysLate(due, sub, now);
    return { phase, dueDate: due, submittedAt: sub, state, daysLate: days, penalty: phasePenalty(days, args.perDay) };
  });
  const totalPenalty = Math.round(phases.reduce((s, p) => s + p.penalty, 0) * 100) / 100;
  return { phases, totalPenalty };
}

export type GroupLateness = {
  id: string;
  name: string;
  members: string[];
  phases: PhaseInfo[];
  totalDays: number;
  totalPenalty: number;
};

/**
 * Lateness for every group in a class, most penalized first.
 * Uses the same per-phase math as projectLateness so every screen agrees.
 */
export function classLateness(args: {
  perDay: number;
  schedules: { phase_number: number; due_date: string }[];
  groups: {
    id: string;
    name: string;
    members: string[];
    currentPhase: number;
    submissions: { phase_number: number; submitted_at: string }[];
  }[];
  now?: Date;
}): { rows: GroupLateness[]; totalPenalty: number; lateGroups: number } {
  const rows = args.groups
    .map((g) => {
      const { phases, totalPenalty } = projectLateness({
        currentPhase: g.currentPhase,
        schedules: args.schedules,
        submissions: g.submissions,
        perDay: args.perDay,
        now: args.now ?? new Date(),
      });
      return {
        id: g.id,
        name: g.name,
        members: g.members,
        phases,
        totalDays: phases.reduce((s, p) => s + p.daysLate, 0),
        totalPenalty,
      };
    })
    .sort((a, b) => b.totalPenalty - a.totalPenalty || a.name.localeCompare(b.name, "pt-BR"));
  const totalPenalty = Math.round(rows.reduce((s, r) => s + r.totalPenalty, 0) * 100) / 100;
  return { rows, totalPenalty, lateGroups: rows.filter((r) => r.totalPenalty > 0).length };
}
