/** Guide shown before the banner upload (from the teacher's FETEC/MS · FECITMS orientation). */
export const BANNER_GUIDE = [
  {
    title: "Legibilidade e tipografia",
    text: "Só fontes sem serifa (Arial, Helvetica, Calibri): corpo do texto com no mínimo 24 pt e títulos com 40 pt ou mais.",
  },
  {
    title: "Equilíbrio visual",
    text: "Distribua texto, imagens, gráficos e espaços em branco. Nada de “muros de texto”.",
  },
  {
    title: "Redação acadêmica",
    text: "Texto todo em tom impessoal (3ª pessoa) e linguagem científica clara.",
  },
  {
    title: "Qualidade das imagens",
    text: "Fotos, diagramas e gráficos em alta resolução, com eixos e legendas identificados.",
  },
] as const;

/** Every item must be ticked before the banner file can be sent. */
export const BANNER_CHECKLIST = [
  {
    key: "template",
    label: "Modelo oficial travado",
    text: "O cabeçalho oficial (logo da escola, nome da feira, título do projeto e código) não foi alterado, movido nem removido.",
  },
  {
    key: "references",
    label: "Mínimo de 3 referências",
    text: "O banner tem pelo menos 3 referências bibliográficas no padrão ABNT (NBR 6023).",
  },
  {
    key: "sections",
    label: "Seções obrigatórias",
    text: "Tem Introdução, Objetivos, Metodologia, Resultados e Discussão, Conclusão e Referências.",
  },
  {
    key: "print",
    label: "Formato para gráfica",
    text: "PDF no tamanho de impressão da feira (90 cm × 120 cm).",
  },
  {
    key: "third_person",
    label: "Escrita acadêmica",
    text: "Todo o texto está em 3ª pessoa impessoal.",
  },
] as const;

export type ChecklistKey = (typeof BANNER_CHECKLIST)[number]["key"];

export function checklistComplete(checked: Partial<Record<ChecklistKey, boolean>>): boolean {
  return BANNER_CHECKLIST.every((i) => checked[i.key] === true);
}

/** The four axes of the AI pre-evaluation and their weights (they add up to 10). */
export const BANNER_AXES = [
  {
    key: "results",
    label: "Resultados, discussão e coerência",
    max: 3.5,
    hint: "Profundidade da análise, comparação com a literatura, 3ª pessoa e alinhamento com o projeto escrito.",
  },
  {
    key: "abnt",
    label: "Normas ABNT e citações",
    max: 2.5,
    hint: "No mínimo 3 referências (NBR 6023), formatação correta e nenhuma citação “órfã”.",
  },
  {
    key: "methodology",
    label: "Metodologia e estrutura",
    max: 2.0,
    hint: "Passo a passo claro e as 6 seções obrigatórias.",
  },
  {
    key: "design",
    label: "Design, modelo e estética",
    max: 2.0,
    hint: "Modelo oficial mantido (logo, título, código, cores) e equilíbrio visual.",
  },
] as const;

export type BannerAxisKey = (typeof BANNER_AXES)[number]["key"];

export type BannerAxisScore = { key: BannerAxisKey; label: string; max: number; score: number; comment: string };

const round1 = (n: number) => Math.round(n * 10) / 10;

export function clampAxis(key: BannerAxisKey, score: number): number {
  const max = BANNER_AXES.find((a) => a.key === key)!.max;
  if (!Number.isFinite(score)) return 0;
  return round1(Math.min(max, Math.max(0, score)));
}

/** Suggested banner grade (0–10): the sum of the four axes, each kept within its own weight. */
export function bannerTotal(axes: { key: BannerAxisKey; score: number }[]): number {
  return round1(axes.reduce((s, a) => s + clampAxis(a.key, a.score), 0));
}

export type Severity = "critico" | "atencao" | "destaque";

export const SEVERITY_LABEL: Record<Severity, string> = {
  critico: "Crítico",
  atencao: "Atenção",
  destaque: "Destaque",
};

/** Everything the group may read (no scores). */
export type BannerFeedback = {
  summary: string;
  axisComments: { key: BannerAxisKey; comment: string }[];
  referencesFound: number;
  sectionsMissing: string[];
  templateOk: boolean;
  thirdPersonOk: boolean;
  coherence: { aligned: boolean; divergences: string[] };
  orphanCitations: string[];
  annotations: { severity: Severity; section: string; note: string }[];
  rewriteSuggestions: string[];
  visualIdeas: string[];
  canvaPrompts: string[];
  flowchartSteps: string[];
  bancaQuestions: { question: string; tip: string }[];
  titleSuggestions: string[];
  resubmission: { changePercent: number; summary: string; fixed: string[]; pending: string[] } | null;
};

export const MIN_REFERENCES = 3;

/** Reasons a banner needs the teacher's attention before printing. Empty = nothing critical. */
export function criticalReasons(f: Pick<BannerFeedback, "referencesFound" | "templateOk" | "coherence" | "annotations" | "sectionsMissing">): string[] {
  const out: string[] = [];
  if (f.referencesFound < MIN_REFERENCES) out.push(`Menos de ${MIN_REFERENCES} referências`);
  if (!f.templateOk) out.push("Modelo oficial alterado");
  if (!f.coherence.aligned) out.push("Diverge do projeto escrito");
  if (f.sectionsMissing.length > 0) out.push("Falta seção obrigatória");
  if (f.annotations.some((a) => a.severity === "critico")) out.push("Erro crítico apontado");
  return out;
}

/** Mermaid code for the methodology flowchart, built from the ordered steps. */
export function mermaidFromSteps(steps: string[]): string {
  const clean = steps.map((s) => s.replace(/["\[\]{}()<>|]/g, "").replace(/\s+/g, " ").trim()).filter(Boolean);
  if (clean.length === 0) return "";
  const lines = ["graph TD"];
  clean.forEach((s, i) => {
    const id = `P${i + 1}`;
    lines.push(`  ${id}["${s}"]`);
    if (i > 0) lines.push(`  P${i} --> ${id}`);
  });
  return lines.join("\n");
}

export { resubmitLateness, type ResubmitLateness, type ReviewRound } from "./penalty";

const str = (v: unknown) => (typeof v === "string" ? v : "");
const strs = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

/** Reads a saved feedback JSON defensively (older rows or partial data never break the screen). */
export function parseBannerFeedback(raw: unknown): BannerFeedback {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const coh = (o["coherence"] && typeof o["coherence"] === "object" ? o["coherence"] : {}) as Record<string, unknown>;
  const res = o["resubmission"] && typeof o["resubmission"] === "object" ? (o["resubmission"] as Record<string, unknown>) : null;
  const sev = (v: unknown): Severity => (v === "critico" || v === "destaque" ? v : "atencao");
  return {
    summary: str(o["summary"]),
    axisComments: (Array.isArray(o["axisComments"]) ? o["axisComments"] : [])
      .map((a) => a as Record<string, unknown>)
      .filter((a) => BANNER_AXES.some((x) => x.key === a["key"]))
      .map((a) => ({ key: a["key"] as BannerAxisKey, comment: str(a["comment"]) })),
    referencesFound: Number(o["referencesFound"] ?? 0) || 0,
    sectionsMissing: strs(o["sectionsMissing"]),
    templateOk: o["templateOk"] !== false,
    thirdPersonOk: o["thirdPersonOk"] !== false,
    coherence: { aligned: coh["aligned"] !== false, divergences: strs(coh["divergences"]) },
    orphanCitations: strs(o["orphanCitations"]),
    annotations: (Array.isArray(o["annotations"]) ? o["annotations"] : []).map((a) => {
      const x = a as Record<string, unknown>;
      return { severity: sev(x["severity"]), section: str(x["section"]), note: str(x["note"]) };
    }),
    rewriteSuggestions: strs(o["rewriteSuggestions"]),
    visualIdeas: strs(o["visualIdeas"]),
    canvaPrompts: strs(o["canvaPrompts"]),
    flowchartSteps: strs(o["flowchartSteps"]),
    bancaQuestions: (Array.isArray(o["bancaQuestions"]) ? o["bancaQuestions"] : []).map((q) => {
      const x = q as Record<string, unknown>;
      return { question: str(x["question"]), tip: str(x["tip"]) };
    }),
    titleSuggestions: strs(o["titleSuggestions"]),
    resubmission: res
      ? {
          changePercent: Math.min(100, Math.max(0, Math.round(Number(res["changePercent"] ?? 0) || 0))),
          summary: str(res["summary"]),
          fixed: strs(res["fixed"]),
          pending: strs(res["pending"]),
        }
      : null,
  };
}

/** SHA-256 of a file, hex — used to refuse a resubmission identical to the previous version. */
export async function fileFingerprint(file: Blob): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
