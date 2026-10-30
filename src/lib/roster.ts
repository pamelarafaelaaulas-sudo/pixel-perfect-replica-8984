import { projectLateness, type PhaseInfo } from "./penalty";

export type RosterRow = {
  studentId: string;
  name: string;
  email: string;
  classId: string;
  className: string;
  groupId: string;
  groupName: string;
  currentPhase: number;
  delivered: number;
  phases: PhaseInfo[];
  daysLate: number;
  penalty: number;
};

type RosterClass = {
  id: string;
  name: string;
  late_penalty_per_day: number | string;
  schedules: { phase_number: number; due_date: string }[] | null;
  groups:
    | {
        id: string;
        group_name: string;
        group_members: { student_id: string; profiles: { name: string; email: string } | null }[] | null;
        projects: { current_phase: number; phase_submissions: { phase_number: number; submitted_at: string }[] | null; banner_reviews?: { resubmit_due_at: string; resubmitted_at: string | null }[] | null } | null;
      }[]
    | null;
};

/**
 * One row per student per group, across all of the teacher's classes.
 * Lateness is the group's project lateness (same math as the deadlines screen),
 * since phases are delivered by the whole group.
 * Sorted by class, then student name.
 */
export function buildRoster(classes: RosterClass[], now: Date = new Date()): RosterRow[] {
  const rows: RosterRow[] = [];
  for (const c of classes) {
    const perDay = Number(c.late_penalty_per_day);
    const schedules = c.schedules ?? [];
    for (const g of c.groups ?? []) {
      const currentPhase = g.projects?.current_phase ?? 1;
      const submissions = g.projects?.phase_submissions ?? [];
      const bannerReviews = g.projects?.banner_reviews ?? [];
      const { phases, totalPenalty } = projectLateness({ currentPhase, schedules, submissions, perDay, bannerReviews, now });
      const delivered = phases.filter((p) => p.state === "delivered").length;
      const daysLate = phases.reduce((s, p) => s + p.daysLate, 0);
      for (const m of g.group_members ?? []) {
        rows.push({
          studentId: m.student_id,
          name: m.profiles?.name ?? "Aluno",
          email: m.profiles?.email ?? "",
          classId: c.id,
          className: c.name,
          groupId: g.id,
          groupName: g.group_name,
          currentPhase,
          delivered,
          phases,
          daysLate,
          penalty: totalPenalty,
        });
      }
    }
  }
  return rows.sort(
    (a, b) => a.className.localeCompare(b.className, "pt-BR") || a.name.localeCompare(b.name, "pt-BR"),
  );
}

/** Case- and accent-insensitive search on student, group or e-mail, optionally limited to one class. */
export function filterRoster(rows: RosterRow[], search: string, classId: string | null): RosterRow[] {
  const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const q = norm(search.trim());
  return rows.filter(
    (r) =>
      (!classId || r.classId === classId) &&
      (!q || norm(r.name).includes(q) || norm(r.groupName).includes(q) || norm(r.email).includes(q)),
  );
}
