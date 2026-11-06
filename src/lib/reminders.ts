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
        group_responsibilities?: { leader_student_id: string | null; diary_student_id: string | null } | null;
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
      const leader = g.group_responsibilities?.leader_student_id;
      for (const m of g.group_members ?? []) {
        if (leader && m.student_id !== leader) continue;
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

/* ---------------- Custom message from the teacher ---------------- */

/** WhatsApp template for the teacher's own text: "Olá, {{1}}! A professora Pâmela deixou um recado… {{2}} …". */
export const CUSTOM_TEMPLATE = "recado_professora";
export const CUSTOM_MAX_CHARS = 600;

export type MessageRecipient = {
  classId: string;
  className: string;
  groupId: string;
  groupName: string;
  studentId: string;
  studentName: string;
  phone: string;
  phase: number;
};

/**
 * Every student of the teacher's classes who can get a custom message (one per student),
 * plus the ones left out with the reason (invalid number, the teacher's own number).
 */
export function messageRecipients(
  classes: ReminderInputClass[],
  opts: { senderPhone?: string | null } = {},
): { recipients: MessageRecipient[]; skipped: SkippedReminder[] } {
  const recipients: MessageRecipient[] = [];
  const skipped: SkippedReminder[] = [];
  const seen = new Set<string>();
  for (const c of classes) {
    for (const g of c.groups ?? []) {
      for (const m of g.group_members ?? []) {
        const studentName = m.profiles?.name ?? "";
        if (seen.has(m.student_id)) continue;
        seen.add(m.student_id);
        const phone = normalizePhone(m.whatsapp);
        if (!phone) {
          skipped.push({ className: c.name, groupName: g.group_name, studentName, reason: "WhatsApp inválido" });
          continue;
        }
        if (opts.senderPhone && samePhone(phone, opts.senderPhone)) {
          skipped.push({ className: c.name, groupName: g.group_name, studentName, reason: "É o número da professora" });
          continue;
        }
        recipients.push({
          classId: c.id,
          className: c.name,
          groupId: g.id,
          groupName: g.group_name,
          studentId: m.student_id,
          studentName,
          phone,
          phase: g.projects?.current_phase ?? 1,
        });
      }
    }
  }
  recipients.sort((a, b) => a.className.localeCompare(b.className, "pt-BR") || a.studentName.localeCompare(b.studentName, "pt-BR"));
  return { recipients, skipped };
}

/**
 * WhatsApp refuses template values with line breaks, tabs or more than 4 spaces in a row:
 * line breaks become " · " and runs of spaces collapse.
 */
export function cleanCustomText(raw: string): string {
  return raw
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" · ");
}

/** Why the custom message cannot be sent yet. Empty = OK. */
export function customMessageProblems(raw: string, selected: number): string[] {
  const text = cleanCustomText(raw);
  const problems: string[] = [];
  if (!text) problems.push("Escreva a mensagem.");
  else if (text.length > CUSTOM_MAX_CHARS) problems.push(`A mensagem tem ${text.length} caracteres; o máximo é ${CUSTOM_MAX_CHARS}.`);
  if (selected === 0) problems.push("Escolha pelo menos um aluno.");
  return problems;
}

/** The two template values: first name, then the teacher's text. */
export function customParams(studentName: string, raw: string): string[] {
  const first = studentName.trim().split(/\s+/)[0] || "aluno(a)";
  return [first, cleanCustomText(raw)];
}

/** Free "click to chat" link: opens the teacher's own WhatsApp with the text ready (no Meta billing). */
export function waLink(phone: string, text: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

/** Reminder text for the free link, same content as the approved template. */
export function reminderText(
  r: Pick<Reminder, "studentName" | "daysLeft" | "phaseName" | "dueDate">,
  teacherName = "Pâmela",
): string {
  const [name, days, phase, due] = reminderParams(r);
  return `Olá, ${name}! Faltam ${days} para o fim do prazo da etapa "${phase}" do seu projeto no FECITI Flow (prazo: ${due}). Esta é uma mensagem automática da professora ${teacherName}, não precisa responder.`;
}

/** Custom note text for the free link; line breaks are kept (allowed outside templates). */
export function customText(studentName: string, raw: string, teacherName = "Pâmela"): string {
  const first = studentName.trim().split(/\s+/)[0] || "aluno(a)";
  return `Olá, ${first}! A professora ${teacherName} deixou um recado sobre o seu projeto científico no FECITI Flow:\n\n${raw.trim()}`;
}

/** Broadcast note has no individual name; copied locally without calling Meta. */
export function generalMessageText(raw: string, teacherName: string): string {
  return `Olá, turma! A professora ${teacherName} deixou um recado sobre o projeto científico no FECITI Flow:\n\n${raw.trim()}`;
}
