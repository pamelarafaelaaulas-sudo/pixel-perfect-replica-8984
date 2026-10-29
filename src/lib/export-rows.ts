import { AI_CRITERIA, latestPerPhase, parseSavedEvaluation } from "./ai-score";
import { bimesterPenalties, finalGrade, gradeAfterPenalty, projectLateness } from "./penalty";
import { BIMESTER_NUMBERS, bimesterMeta, phaseMeta } from "./phases";
import { projectCode } from "./project-code";

type InputGroup = {
  id: string;
  group_name: string;
  group_members: { student_id: string; profiles: { name: string } | null }[] | null;
  projects: {
    current_phase: number;
    area_code?: string | null;
    code_number?: number | null;
    phase_submissions: { phase_number: number; submitted_at: string }[] | null } | null;
  /** `trimester` holds the bimestre number (database column name). */
  grades:
    | { trimester: number; score: number | string; feedback: string | null; is_reference_ten: boolean; created_at: string }[]
    | null;
  /** Teacher's per-student adjustment of the bimestre grade. */
  student_grade_adjustments?: { student_id: string; bimester: number; points: number | string; note: string | null }[] | null;
};

export type ExportInput = {
  classes: {
    id: string;
    name: string;
    code_label?: string | null;
    late_penalty_per_day: number | string;
    schedules: { phase_number: number; due_date: string }[] | null;
    groups: InputGroup[] | null;
  }[];
  ai: {
    id: string;
    group_id: string;
    phase_number: number;
    requested_by: string | null;
    created_at: string;
    overall: number | string;
    criteria: unknown;
    summary: string;
    tips: unknown;
    evaluated_text: string;
  }[];
  peers: {
    group_id: string;
    trimester: number;
    evaluator_student_id: string;
    evaluated_student_id: string;
    score: number | string;
    feedback: string | null;
    created_at: string;
  }[];
};

export type ExportFilters = { classId?: string | undefined; bimester?: number | undefined; now?: Date };

export type GradeExportRow = {
  className: string;
  groupName: string;
  projectCode: string;
  members: string;
  bimester: string;
  score: number | null;
  penalty: number;
  /** Launched grade minus that bimestre's late penalty (never below 0); null while not launched. */
  total: number | null;
  reference: string;
  feedback: string;
  launchedAt: Date | null;
};

export type AiExportRow = {
  className: string;
  groupName: string;
  bimester: string;
  phase: string;
  overall: number;
  criteria: number[];
  summary: string;
  tipsClarity: string;
  tipsOrganization: string;
  tipsCitations: string;
  evaluatedAt: Date;
  attempts: number;
};

export type PeerExportRow = {
  className: string;
  groupName: string;
  bimester: string;
  evaluator: string;
  evaluated: string;
  score: number;
  feedback: string;
  createdAt: Date;
};

const bimLabel = (b: number) => `${b}º bimestre · ${bimesterMeta(b).title}`;
const byText = (a: string, b: string) => a.localeCompare(b, "pt-BR");

/** All rows of the teacher's grades-and-feedback spreadsheet, filtered by class and bimestre. */
export function buildExport(input: ExportInput, filters: ExportFilters = {}) {
  const now = filters.now ?? new Date();
  const bims = filters.bimester ? [filters.bimester] : [...BIMESTER_NUMBERS];
  const classes = input.classes
    .filter((c) => !filters.classId || c.id === filters.classId)
    .sort((a, b) => byText(a.name, b.name));

  const grades: GradeExportRow[] = [];
  const ai: AiExportRow[] = [];
  const peers: PeerExportRow[] = [];

  for (const c of classes) {
    const perDay = Number(c.late_penalty_per_day);
    const groups = [...(c.groups ?? [])].sort((a, b) => byText(a.group_name, b.group_name));
    for (const g of groups) {
      const names = new Map((g.group_members ?? []).map((m) => [m.student_id, m.profiles?.name ?? ""]));
      const { phases } = projectLateness({
        currentPhase: g.projects?.current_phase ?? 1,
        schedules: c.schedules ?? [],
        submissions: g.projects?.phase_submissions ?? [],
        perDay,
        now,
      });
      const penalties = bimesterPenalties(phases);

      for (const b of bims) {
        const grade = (g.grades ?? []).find((x) => x.trimester === b);
        const score = grade ? Number(grade.score) : null;
        const penalty = penalties[b] ?? 0;
        grades.push({
          className: c.name,
          groupName: g.group_name,
          projectCode: projectCode(g.projects?.area_code, c.code_label, g.projects?.code_number) ?? "",
          members: [...names.values()].filter(Boolean).sort(byText).join(", "),
          bimester: bimLabel(b),
          score,
          penalty,
          total: score === null ? null : gradeAfterPenalty(score, penalty),
          reference: grade?.is_reference_ten ? "Sim" : "",
          feedback: grade?.feedback ?? "",
          launchedAt: grade ? new Date(grade.created_at) : null,
        });
      }

      const latest = latestPerPhase(input.ai.filter((r) => r.group_id === g.id).map(parseSavedEvaluation));
      for (const [phaseNumber, { latest: ev, count }] of Object.entries(latest).sort((a, b) => Number(a[0]) - Number(b[0]))) {
        const meta = phaseMeta(Number(phaseNumber));
        if (!bims.includes(meta.bimester)) continue;
        ai.push({
          className: c.name,
          groupName: g.group_name,
          bimester: bimLabel(meta.bimester),
          phase: `${meta.number}. ${meta.name}`,
          overall: ev.overall,
          criteria: AI_CRITERIA.map((k) => ev.criteria.find((x) => x.key === k.key)?.score ?? 0),
          summary: ev.summary,
          tipsClarity: ev.tips.clarity.join("\n"),
          tipsOrganization: ev.tips.organization.join("\n"),
          tipsCitations: ev.tips.citations.join("\n"),
          evaluatedAt: new Date(ev.createdAt),
          attempts: count,
        });
      }

      const groupPeers = input.peers
        .filter((p) => p.group_id === g.id && bims.includes(p.trimester))
        .map((p) => ({
          className: c.name,
          groupName: g.group_name,
          bimester: bimLabel(p.trimester),
          bimNumber: p.trimester,
          evaluator: names.get(p.evaluator_student_id) || "Aluno(a) que saiu do grupo",
          evaluated: names.get(p.evaluated_student_id) || "Aluno(a) que saiu do grupo",
          score: Number(p.score),
          feedback: p.feedback ?? "",
          createdAt: new Date(p.created_at),
        }))
        .sort((a, b) => a.bimNumber - b.bimNumber || byText(a.evaluated, b.evaluated) || byText(a.evaluator, b.evaluator));
      for (const { bimNumber: _b, ...row } of groupPeers) peers.push(row);
    }
  }

  return { grades, ai, peers };
}

export type StudentGradeDetail = {
  /** Group grade launched by the teacher; null = not launched. */
  score: number | null;
  /** Late penalty of that bimestre's stages. */
  penalty: number;
  /** Teacher's per-student adjustment (+/−). */
  adjustment: number;
  /** score − penalty + adjustment, between 0 and 10; null = not launched. */
  final: number | null;
};

export type StudentGradeRow = {
  name: string;
  groupName: string;
  projectCode: string;
  /** Final grade per bimestre, in BIMESTER_NUMBERS order; null = not launched. */
  totals: (number | null)[];
  details: StudentGradeDetail[];
};

/**
 * One block per class (sorted by name), one row per student (sorted by name) with each bimestre's
 * final grade: group grade − that bimestre's late penalty + the teacher's adjustment for that student.
 */
export function buildStudentGrades(classes: ExportInput["classes"], now: Date = new Date()) {
  return [...classes]
    .sort((a, b) => byText(a.name, b.name))
    .map((c) => {
      const rows: StudentGradeRow[] = [];
      for (const g of c.groups ?? []) {
        const { phases } = projectLateness({
          currentPhase: g.projects?.current_phase ?? 1,
          schedules: c.schedules ?? [],
          submissions: g.projects?.phase_submissions ?? [],
          perDay: Number(c.late_penalty_per_day),
          now,
        });
        const penalties = bimesterPenalties(phases);
        const code = projectCode(g.projects?.area_code, c.code_label, g.projects?.code_number) ?? "";
        for (const m of g.group_members ?? []) {
          const details = BIMESTER_NUMBERS.map((b): StudentGradeDetail => {
            const grade = (g.grades ?? []).find((x) => x.trimester === b);
            const adj = (g.student_grade_adjustments ?? []).find((x) => x.student_id === m.student_id && x.bimester === b);
            const score = grade ? Number(grade.score) : null;
            const penalty = penalties[b] ?? 0;
            const adjustment = adj ? Number(adj.points) : 0;
            return { score, penalty, adjustment, final: score === null ? null : finalGrade(score, penalty, adjustment) };
          });
          rows.push({
            name: m.profiles?.name ?? "",
            groupName: g.group_name,
            projectCode: code,
            totals: details.map((d) => d.final),
            details,
          });
        }
      }
      rows.sort((a, b) => byText(a.name, b.name));
      return { className: c.name, rows };
    });
}

export type NumberingInputClass = {
  name: string;
  code_label?: string | null | undefined;
  groups:
    | {
        group_name: string;
        group_members?: { profiles: { name: string } | null }[] | null;
        projects: { area_code?: string | null | undefined; code_number?: number | null | undefined } | null;
      }[]
    | null;
};

export type NumberingRow = {
  number: number | null;
  projectCode: string;
  className: string;
  classLabel: string;
  groupName: string;
  area: string;
  members: string;
};

/** The teacher's projects in code-number order (projects without a number go last). */
export function buildNumberingRows(classes: NumberingInputClass[], areaName: (code: string | null) => string | null) {
  const rows: NumberingRow[] = [];
  for (const c of classes) {
    for (const g of c.groups ?? []) {
      if (!g.projects) continue;
      rows.push({
        number: g.projects.code_number ?? null,
        projectCode: projectCode(g.projects.area_code, c.code_label, g.projects.code_number) ?? "",
        className: c.name,
        classLabel: c.code_label ?? "",
        groupName: g.group_name,
        area: areaName(g.projects.area_code ?? null) ?? "",
        members: (g.group_members ?? []).map((m) => m.profiles?.name ?? "").filter(Boolean).sort(byText).join(", "),
      });
    }
  }
  return rows.sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity) || byText(a.groupName, b.groupName));
}
