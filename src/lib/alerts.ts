/** Colored alerts on the student home: red = critical, yellow = attention, green = success. Pure and tested. */
import { PHASES } from "./phases";

export type AlertTone = "red" | "yellow" | "green";
export type StudentAlert = { tone: AlertTone; title: string; detail: string };

export type AlertInput = {
  now: Date;
  currentPhase: number;
  schedules: { phase_number: number; due_date: string }[];
  submittedPhases: number[];
  bannerReviews: { resubmit_due_at: string; resubmitted_at: string | null }[];
  writtenReviews: { phase_number: number; resubmit_due_at: string; resubmitted_at: string | null }[];
  lastDiaryDate: string | null;
  diaryRequired: boolean;
  ethicsHumanResearch: boolean | null;
  ethicsProblems: number;
  bannerGraded: boolean;
};

const DAY = 86_400_000;
export const CRITICAL_HOURS = 48;
export const DIARY_STALE_DAYS = 7;
export const RESUBMIT_SOON_DAYS = 3;

const phaseName = (n: number) => PHASES.find((p) => p.number === n)?.name ?? `Etapa ${n}`;

export function studentAlerts(i: AlertInput): StudentAlert[] {
  const out: StudentAlert[] = [];
  const now = i.now.getTime();
  const submitted = new Set(i.submittedPhases);

  // Current stage deadline
  const due = i.schedules.find((s) => s.phase_number === i.currentPhase);
  if (due && !submitted.has(i.currentPhase) && i.currentPhase <= PHASES.length) {
    const left = new Date(due.due_date).getTime() - now;
    if (left < 0)
      out.push({ tone: "red", title: `Prazo vencido: ${phaseName(i.currentPhase)}`, detail: `Atrasado há ${Math.ceil(-left / DAY)} dia(s). Cada dia desconta da nota.` });
    else if (left <= CRITICAL_HOURS * 3_600_000)
      out.push({ tone: "red", title: `Prazo crítico: ${phaseName(i.currentPhase)}`, detail: `Faltam ${Math.max(1, Math.round(left / 3_600_000))} hora(s) para entregar.` });
  }

  // Open resubmissions (banner + written)
  const open = [
    ...i.bannerReviews.map((r) => ({ ...r, label: "Banner" })),
    ...i.writtenReviews.map((r) => ({ ...r, label: phaseName(r.phase_number) })),
  ].filter((r) => !r.resubmitted_at);
  for (const r of open) {
    const left = new Date(r.resubmit_due_at).getTime() - now;
    if (r.label === "Banner" || left < 0)
      out.push({ tone: "red", title: `${r.label} devolvido com correções`, detail: left < 0 ? "O prazo de reenvio passou — enviem a nova versão o quanto antes." : "Leiam a devolutiva da professora e enviem a nova versão." });
    else
      out.push({ tone: "yellow", title: `Reenvio pendente: ${r.label}`, detail: left <= RESUBMIT_SOON_DAYS * DAY ? `Faltam ${Math.ceil(left / DAY)} dia(s) para reenviar.` : "Há uma devolutiva esperando a nova versão." });
  }

  // Diary
  if (i.diaryRequired) {
    const last = i.lastDiaryDate ? new Date(i.lastDiaryDate).getTime() : null;
    if (last === null || now - last > DIARY_STALE_DAYS * DAY)
      out.push({ tone: "yellow", title: "Diário de bordo parado", detail: last === null ? "O grupo ainda não registrou nada no diário." : `Sem registro há ${Math.floor((now - last) / DAY)} dias.` });
  }

  // Ethics
  if (i.currentPhase >= 7 && i.ethicsHumanResearch === null)
    out.push({ tone: "yellow", title: "Triagem de ética pendente", detail: "Respondam se a pesquisa envolve pessoas, na Metodologia." });
  else if (i.ethicsHumanResearch === true && i.ethicsProblems === 0)
    out.push({ tone: "green", title: "TCLE / ética aprovada", detail: "A triagem de ética do grupo está completa." });

  // Successes
  if (i.bannerGraded) out.push({ tone: "green", title: "Banner validado", detail: "A professora lançou a nota do banner." });
  const lastDone = Math.max(0, ...i.submittedPhases);
  if (lastDone > 0) {
    const s = i.schedules.find((x) => x.phase_number === lastDone);
    out.push({ tone: "green", title: `Entrega validada: ${phaseName(lastDone)}`, detail: s ? "Etapa entregue e registrada." : "Etapa entregue." });
  }

  const order: Record<AlertTone, number> = { red: 0, yellow: 1, green: 2 };
  return out.sort((a, b) => order[a.tone] - order[b.tone]);
}
