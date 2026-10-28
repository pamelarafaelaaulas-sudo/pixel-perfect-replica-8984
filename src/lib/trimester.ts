import { gradeAfterPenalty, projectLateness } from "./penalty";

export type TrimesterGroupRow = {
  groupId: string;
  groupName: string;
  members: string[];
  score: number | null;
  feedback: string | null;
  reference: boolean;
  penalty: number;
  /** Launched grade minus the group's late penalty (never below 0); null while not launched. */
  total: number | null;
};

export type TrimesterClass = {
  classId: string;
  className: string;
  perDay: number;
  rows: TrimesterGroupRow[];
  launched: number;
};

type InputClass = {
  id: string;
  name: string;
  late_penalty_per_day: number | string;
  schedules: { phase_number: number; due_date: string }[] | null;
  groups:
    | {
        id: string;
        group_name: string;
        group_members: { profiles: { name: string } | null }[] | null;
        projects: { current_phase: number; phase_submissions: { phase_number: number; submitted_at: string }[] | null } | null;
        grades: { trimester: number; score: number | string; feedback: string | null; is_reference_ten: boolean }[] | null;
      }[]
    | null;
};

/**
 * One trimester across all of the teacher's classes: for each group, the launched grade,
 * the project's late penalty and the total (same rule as the per-student review screen).
 */
export function trimesterReport(classes: InputClass[], trimester: number, now: Date = new Date()): TrimesterClass[] {
  return classes.map((c) => {
    const perDay = Number(c.late_penalty_per_day);
    const rows = (c.groups ?? [])
      .map((g) => {
        const { totalPenalty } = projectLateness({
          currentPhase: g.projects?.current_phase ?? 1,
          schedules: c.schedules ?? [],
          submissions: g.projects?.phase_submissions ?? [],
          perDay,
          now,
        });
        const grade = (g.grades ?? []).find((x) => x.trimester === trimester);
        const score = grade ? Number(grade.score) : null;
        return {
          groupId: g.id,
          groupName: g.group_name,
          members: (g.group_members ?? []).map((m) => m.profiles?.name ?? "").filter(Boolean),
          score,
          feedback: grade?.feedback ?? null,
          reference: grade?.is_reference_ten ?? false,
          penalty: totalPenalty,
          total: score === null ? null : gradeAfterPenalty(score, totalPenalty),
        };
      })
      .sort((a, b) => a.groupName.localeCompare(b.groupName, "pt-BR"));
    return {
      classId: c.id,
      className: c.name,
      perDay,
      rows,
      launched: rows.filter((r) => r.score !== null).length,
    };
  });
}
