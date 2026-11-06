/** Global fair indicators for the teacher dashboard and its CSV report. Pure and tested. */
import { ethicsProblems, normalizeFairs } from "./ethics";
import { areaLabel } from "./project-code";

export type IndicatorProject = {
  className: string;
  groupName: string;
  area: string | null;
  members: number;
  currentPhase: number;
  fairsInterest: boolean;
  fairs: string[];
  ethicsHuman: boolean | null;
  ethicsCollection: string[];
  ethicsFormUrl: string | null;
  ethicsTemplate: string | null;
  peerScores: number[];
};

export type EthicsState = "pendente" | "sem_humanos" | "conforme" | "incompleta";

export function ethicsState(p: IndicatorProject): EthicsState {
  if (p.ethicsHuman === null) return "pendente";
  if (!p.ethicsHuman) return "sem_humanos";
  return ethicsProblems({
    ethics_human_research: true,
    ethics_collection: p.ethicsCollection,
    ethics_form_url: p.ethicsFormUrl,
    ethics_form_template_url: p.ethicsTemplate,
  }).length
    ? "incompleta"
    : "conforme";
}

const count = (keys: string[]) => {
  const m = new Map<string, number>();
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
};

export function fairIndicators(projects: IndicatorProject[]) {
  const answered = projects.filter((p) => ethicsState(p) !== "pendente");
  const ok = answered.filter((p) => ethicsState(p) !== "incompleta");
  const fairs = projects.map((p) => {
    const f = normalizeFairs(p.fairsInterest, p.fairs);
    return f.length === 2 ? "Ambas" : f.length === 1 ? f[0] : "Só FECITI";
  });
  const scores = projects.flatMap((p) => p.peerScores);
  return {
    totalProjects: projects.length,
    totalStudents: projects.reduce((s, p) => s + p.members, 0),
    byArea: count(projects.map((p) => (p.area ? areaLabel(p.area) : "Sem área"))),
    byClass: count(projects.map((p) => p.className)),
    /** % of answered projects that are compliant (no humans, or complete consent). null when none answered. */
    ethicsCompliance: answered.length ? Math.round((ok.length / answered.length) * 100) : null,
    ethicsPending: projects.length - answered.length,
    fairs: ["FETEC/MS", "FECINTEC", "Ambas", "Só FECITI"].map((label) => ({ label, value: fairs.filter((f) => f === label).length })),
    /** Average peer collaboration score (1–5), one decimal. */
    satisfaction: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null,
    satisfactionCount: scores.length,
  };
}

const ETHICS_LABEL: Record<EthicsState, string> = {
  pendente: "Pendente",
  sem_humanos: "Sem pesquisa com pessoas",
  conforme: "Conforme (TCLE/Forms)",
  incompleta: "Incompleta",
};

const cell = (v: string | number) => {
  const s = String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV with ";" separator (opens correctly in Excel pt-BR). */
export function indicatorsCsv(projects: IndicatorProject[]): string {
  const head = ["Turma", "Grupo", "Área", "Integrantes", "Etapa atual", "Ética", "Feiras externas", "Satisfação média"];
  const rows = projects.map((p) => {
    const f = normalizeFairs(p.fairsInterest, p.fairs);
    const avg = p.peerScores.length ? (p.peerScores.reduce((a, b) => a + b, 0) / p.peerScores.length).toFixed(1).replace(".", ",") : "";
    return [p.className, p.groupName, p.area ? areaLabel(p.area) : "", p.members, p.currentPhase, ETHICS_LABEL[ethicsState(p)], f.join(" + ") || "Só FECITI", avg];
  });
  return "\uFEFF" + [head, ...rows].map((r) => r.map(cell).join(";")).join("\n");
}
