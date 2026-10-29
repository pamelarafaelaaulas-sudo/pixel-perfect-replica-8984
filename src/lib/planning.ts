import { projectLateness, type PhaseInfo } from "./penalty";
import { PHASES } from "./phases";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole calendar-ish days from now until the deadline (negative = already passed). */
export function daysUntil(due: string | Date, now: Date = new Date()): number {
  const diff = new Date(due).getTime() - now.getTime();
  return diff >= 0 ? Math.ceil(diff / DAY_MS) : -Math.ceil(-diff / DAY_MS);
}

/** "vence hoje", "vence em 3 dias", "venceu há 2 dias". */
export function deadlineLabel(due: string | null, now: Date = new Date()): string {
  if (!due) return "sem prazo";
  const d = daysUntil(due, now);
  if (d === 0) return "vence agora";
  if (d > 0) return d === 1 ? "vence em 1 dia" : `vence em ${d} dias`;
  return d === -1 ? "venceu há 1 dia" : `venceu há ${-d} dias`;
}

export type CellStatus = "on_time" | "late_delivered" | "late_open" | "in_progress" | "upcoming" | "skipped";

export function cellStatus(p: PhaseInfo): CellStatus {
  if (p.state === "delivered") return p.daysLate > 0 ? "late_delivered" : "on_time";
  if (p.state === "skipped") return "skipped";
  if (p.daysLate > 0) return "late_open";
  return p.state === "in_progress" ? "in_progress" : "upcoming";
}

export type PlanningStage = {
  phase: number;
  name: string;
  bimester: number;
  dueDate: string | null;
  delivered: number;
  late: number;
  groups: number;
};

export type PlanningGroup = { id: string; name: string; currentPhase: number; delivered: number; phases: PhaseInfo[] };

/** Every stage with its deadline and how many groups delivered it, plus each group's stage-by-stage status. */
export function planningOverview(args: {
  schedules: { phase_number: number; due_date: string }[];
  groups: { id: string; name: string; currentPhase: number; submissions: { phase_number: number; submitted_at: string }[] }[];
  now?: Date;
}): { stages: PlanningStage[]; groups: PlanningGroup[] } {
  const groups = args.groups
    .map((g) => {
      const { phases } = projectLateness({
        currentPhase: g.currentPhase,
        schedules: args.schedules,
        submissions: g.submissions,
        perDay: 0,
        now: args.now ?? new Date(),
      });
      return { id: g.id, name: g.name, currentPhase: g.currentPhase, delivered: phases.filter((p) => p.state === "delivered").length, phases };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const stages = PHASES.map((p) => {
    const infos = groups.map((g) => g.phases[p.number - 1]!);
    return {
      phase: p.number,
      name: p.name,
      bimester: p.bimester,
      dueDate: args.schedules.find((s) => s.phase_number === p.number)?.due_date ?? null,
      delivered: infos.filter((i) => i.state === "delivered").length,
      late: infos.filter((i) => i.daysLate > 0).length,
      groups: groups.length,
    };
  });
  return { stages, groups };
}
