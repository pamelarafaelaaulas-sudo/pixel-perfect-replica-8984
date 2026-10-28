import { BIMESTER_NUMBERS, PHASES } from "./phases";

const STAGES = PHASES.map((p) => p.number);
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
 * Lateness for each stage of a project.
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
  const phases: PhaseInfo[] = STAGES.map((phase) => {
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

/**
 * Late penalty per bimestre: each stage's penalty comes off only the bimestre that stage belongs to
 * (1º = Tema a Metodologia, 2º = Introdução a Resumo, 3º = Banner, 4º = Feira, no stages).
 */
export function bimesterPenalties(phases: PhaseInfo[]): Record<number, number> {
  const out: Record<number, number> = Object.fromEntries(BIMESTER_NUMBERS.map((b) => [b, 0]));
  for (const p of phases) {
    const b = PHASES[p.phase - 1]?.bimester;
    if (b) out[b] = Math.round(((out[b] ?? 0) + p.penalty) * 100) / 100;
  }
  return out;
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

export type PhaseTotals = {
  phase: number;
  onTime: number;
  deliveredLate: number;
  openLate: number;
  pending: number;
  days: number;
  penalty: number;
};

/** Per-phase totals across all groups of a class (for the deadlines screen). */
export function phaseTotals(rows: { phases: PhaseInfo[] }[]): PhaseTotals[] {
  return STAGES.map((phase) => {
    const t: PhaseTotals = { phase, onTime: 0, deliveredLate: 0, openLate: 0, pending: 0, days: 0, penalty: 0 };
    for (const r of rows) {
      const p = r.phases.find((x) => x.phase === phase);
      if (!p) continue;
      if (p.state === "delivered") {
        if (p.daysLate > 0) t.deliveredLate += 1;
        else t.onTime += 1;
      } else if (p.daysLate > 0) t.openLate += 1;
      else if (p.state !== "skipped") t.pending += 1;
      t.days += p.daysLate;
      t.penalty += p.penalty;
    }
    t.penalty = Math.round(t.penalty * 100) / 100;
    return t;
  });
}
