import { PHASES, phaseMeta } from "./phases";

/** WhatsApp template used for stage-deadline reminders (must be approved by Meta before sending). */
export const REMINDER_TEMPLATE = "lembrete_prazo_etapa";
export const REMINDER_LANGUAGE = "pt_BR";

const DAY = 86_400_000;
const LAST_PHASE = PHASES[PHASES.length - 1]!.number;

export type ReminderInputClass = {
  id: string;
  name: string;
  schedules: { phase_number: number; due_date: string }[] | null;
  groups:
    | {
        id: string;
        group_name: string;
        projects: { current_phase: number; phase_submissions: { phase_number: number }[] | null } | null;
        group_members: { student_id: string; whatsapp: string; profiles: { name: string } | null }[] | null;
      }[]
    | null;
};

export type Reminder = {
  classId: string;
  className: string;
  groupId: string;
  groupName: string;
  studentId: string;
  studentName: string;
  /** E.164 digits without "+", e.g. 5567992870578. */
  phone: string;
  phase: number;
  phaseName: string;
  dueDate: string;
  daysLeft: number;
};

export type SkippedReminder = {
  className: string;
  groupName: string;
  studentName: string;
  reason: string;
};

/**
 * Brazilian WhatsApp number → E.164 digits ("67 99287-0578" → "5567992870578").
 * Returns null when it cannot be a valid mobile number.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  let d = (raw ?? "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (!d.startsWith("55") || d.length < 12 || d.length > 13) return null;
  return d;
}

/** Same phone regardless of the extra 9 and country code (compares the last 8 digits). */
export function samePhone(a: string, b: string): boolean {
  const x = a.replace(/\D/g, "");
  const y = b.replace(/\D/g, "");
  return x.length >= 8 && y.length >= 8 && x.slice(-8) === y.slice(-8);
}

/** "3 dias", "1 dia". */
export function daysText(n: number): string {
  return n === 1 ? "1 dia" : `${n} dias`;
}

/** "31/10/2026 às 23:59" in Cuiabá time. */
export function dueText(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("pt-BR", { timeZone: "America/Cuiaba", day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("pt-BR", { timeZone: "America/Cuiaba", hour: "2-digit", minute: "2-digit" });
  return `${date} às ${time}`;
}

/** The four template values, in order: name, days left, stage, deadline. */
export function reminderParams(r: Pick<Reminder, "studentName" | "daysLeft" | "phaseName" | "dueDate">): string[] {
  const first = r.studentName.trim().split(/\s+/)[0] || r.studentName;
  return [first, daysText(r.daysLeft), r.phaseName, dueText(r.dueDate)];
}

/**
 * Who gets a reminder now: every member of a group whose current stage is not delivered yet and
 * whose deadline is still ahead. Overdue stages, finished projects, invalid numbers and the
 * sender's own number are skipped (and listed with the reason).
 */
export function buildReminders(
  classes: ReminderInputClass[],
  now: Date,
  opts: { senderPhone?: string | null } = {},
): { reminders: Reminder[]; skipped: SkippedReminder[] } {
  const reminders: Reminder[] = [];
  const skipped: SkippedReminder[] = [];
  const seen = new Set<string>();
  for (const c of classes) {
    for (const g of c.groups ?? []) {
      const project = g.projects;
      const phase = project?.current_phase ?? 1;
      const delivered = (project?.phase_submissions ?? []).some((s) => s.phase_number === phase);
      const due = (c.schedules ?? []).find((s) => s.phase_number === phase)?.due_date;
      for (const m of g.group_members ?? []) {
        const studentName = m.profiles?.name ?? "";
        const skip = (reason: string) => skipped.push({ className: c.name, groupName: g.group_name, studentName, reason });
        if (delivered && phase >= LAST_PHASE) {
          skip("Projeto entregue");
          continue;
        }
        if (!due) {
          skip("Etapa sem prazo");
          continue;
        }
        const ms = new Date(due).getTime() - now.getTime();
        if (ms <= 0) {
          skip("Prazo da etapa já passou");
          continue;
        }
        const phone = normalizePhone(m.whatsapp);
        if (!phone) {
          skip("WhatsApp inválido");
          continue;
        }
        if (opts.senderPhone && samePhone(phone, opts.senderPhone)) {
          skip("É o número da professora");
          continue;
        }
        const key = `${phone}:${phase}`;
        if (seen.has(key)) continue;
        seen.add(key);
        reminders.push({
          classId: c.id,
          className: c.name,
          groupId: g.id,
          groupName: g.group_name,
          studentId: m.student_id,
          studentName,
          phone,
          phase,
          phaseName: phaseMeta(phase).name,
          dueDate: due,
          daysLeft: Math.max(1, Math.ceil(ms / DAY)),
        });
      }
    }
  }
  reminders.sort((a, b) => a.className.localeCompare(b.className, "pt-BR") || a.studentName.localeCompare(b.studentName, "pt-BR"));
  return { reminders, skipped };
}

/** Whether the automatic run is due: never ran, or at least `intervalDays` ago (2 h of slack for the daily check). */
export function autoRunDue(lastRun: string | null, intervalDays: number, now: Date): boolean {
  if (!lastRun) return true;
  return now.getTime() - new Date(lastRun).getTime() >= intervalDays * DAY - 2 * 3_600_000;
}
