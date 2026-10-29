/**
 * Delivery rules for each stage, from the teacher's specification document.
 * A stage can only be delivered when every check passes.
 * The database (phase_rule_problem in submit_phase) enforces the same word limits.
 */
import { checkCitations, citedWorks, missingReferences, workKey, type CitedWork } from "./citations";

/** Parts where ABNT in-text citations are mandatory. */
export const CITATION_FIELDS: Record<string, string> = {
  introduction: "Introdução",
  results_discussion: "Resultados e discussão",
};

/**
 * Every work cited in the Introdução and Resultados e discussão, and whether the reference
 * list has it. A work cited in both parts is listed once, under the first part.
 */
export function referenceCheck(
  values: Partial<Record<string, unknown>>,
): { work: CitedWork; label: string; found: boolean }[] {
  const refs = typeof values["references_list"] === "string" ? values["references_list"] : "";
  const all = Object.entries(CITATION_FIELDS).flatMap(([key, label]) =>
    citedWorks(typeof values[key] === "string" ? (values[key] as string) : "").map((work) => ({ work, label })),
  );
  const keys = all.map((a) => workKey(a.work));
  const unique = all.filter((_, i) => keys.indexOf(keys[i]!) === i);
  const missing = new Set(missingReferences(unique.map((u) => u.work), refs));
  return unique.map((u) => ({ ...u, found: !missing.has(u.work) }));
}

export type WordLimit = { min: number; max: number | null };

/** Word limits per field. min 1 = required. */
export const WORD_LIMITS: Partial<Record<string, WordLimit>> = {
  theme: { min: 1, max: null },
  guiding_question: { min: 1, max: null },
  social_application: { min: 1, max: null },
  title: { min: 1, max: null },
  general_objective: { min: 1, max: 50 },
  specific_objectives: { min: 1, max: 100 },
  methodology: { min: 250, max: 750 },
  introduction: { min: 250, max: 500 },
  results_discussion: { min: 250, max: 750 },
  conclusion: { min: 1, max: 150 },
  references_list: { min: 1, max: null },
  abstract: { min: 150, max: 250 },
};

export const MAX_SPECIFIC_OBJECTIVES = 5;
export const KEYWORDS_MIN = 3;
export const KEYWORDS_MAX = 5;

export function countWords(text: string | null | undefined): number {
  const t = (text ?? "").trim();
  return t === "" ? 0 : t.split(/\s+/).length;
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

export function splitKeywords(text: string | null | undefined): string[] {
  return (text ?? "")
    .split(";")
    .map((k) => k.trim())
    .filter(Boolean);
}

export function objectiveLines(text: string | null | undefined): string[] {
  return (text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Keywords that also appear in the title (as whole words or phrases). */
export function keywordsInTitle(keywords: string[], title: string | null | undefined): string[] {
  const t = ` ${norm(title ?? "")} `;
  return keywords.filter((k) => {
    const nk = norm(k);
    return nk !== "" && t.includes(` ${nk} `);
  });
}

/** A Canva design link: https://www.canva.com/design/... or a canva.link short link. */
export function isCanvaUrl(url: string | null | undefined): boolean {
  return /^https:\/\/([a-z0-9-]+\.)*(canva\.com|canva\.link)\//i.test((url ?? "").trim());
}

/** The design id in a canva.com/design/<id>/... link; null for short links or other URLs. Mirrored by SQL canva_design_id. */
export function canvaDesignId(url: string | null | undefined): string | null {
  return (url ?? "").match(/canva\.com\/design\/([A-Za-z0-9_-]+)/i)?.[1]?.toLowerCase() ?? null;
}

/** True when the group pasted the teacher's template link instead of the link to its own copy. */
export function isTemplateLink(groupUrl: string | null | undefined, templateUrl: string | null | undefined): boolean {
  const g = canvaDesignId(groupUrl);
  return g !== null && g === canvaDesignId(templateUrl);
}

export const TEMPLATE_LINK_PROBLEM =
  "Esse é o link do modelo da professora. Use o modelo no Canva e cole o link da cópia do grupo.";

export function limitLabel(w: WordLimit): string {
  if (w.max === null) return "obrigatório";
  if (w.min <= 1) return `até ${w.max} palavras`;
  return `de ${w.min} a ${w.max} palavras`;
}

/** Problems that block delivering a stage. Empty list = can deliver. */
const str = (v: unknown) => (typeof v === "string" ? v : "");

export function phaseProblems(
  phase: number,
  values: Partial<Record<string, unknown>>,
  articleCount: number,
): string[] {
  const problems: string[] = [];
  if (phase === 2) {
    if (articleCount === 0) problems.push("Adicione pelo menos um artigo.");
    return problems;
  }
  const checkCitationsIn = (key: string) => {
    const label = CITATION_FIELDS[key];
    if (!label) return;
    const text = str(values[key]);
    if (countWords(text) === 0) return;
    const { citations, issues } = checkCitations(text);
    if (citations.length === 0)
      problems.push(`${label}: cite pelo menos um autor nas normas ABNT, por exemplo (Silva, 2020) ou Silva (2020).`);
    for (const i of issues) problems.push(`Citação fora da ABNT: “${i.text}”. ${i.fix}`);
  };
  const checkWords = (key: string, label: string) => {
    const lim = WORD_LIMITS[key];
    if (!lim) return;
    const n = countWords(str(values[key]));
    if (n === 0) problems.push(`Preencha: ${label}.`);
    else if (n < lim.min) problems.push(`${label}: ${n} palavras, o mínimo é ${lim.min}.`);
    else if (lim.max !== null && n > lim.max) problems.push(`${label}: ${n} palavras, o máximo é ${lim.max}.`);
  };
  switch (phase) {
    case 1:
      checkWords("theme", "Tema");
      break;
    case 3:
      checkWords("guiding_question", "Pergunta norteadora");
      checkWords("social_application", "Aplicação ou intervenção social");
      break;
    case 4:
      checkWords("title", "Título");
      break;
    case 5:
      checkWords("general_objective", "Objetivo geral");
      break;
    case 6: {
      checkWords("specific_objectives", "Objetivos específicos");
      const lines = objectiveLines(str(values["specific_objectives"])).length;
      if (lines > MAX_SPECIFIC_OBJECTIVES)
        problems.push(`São ${lines} objetivos específicos; o máximo é ${MAX_SPECIFIC_OBJECTIVES} (um por linha).`);
      break;
    }
    case 7:
      checkWords("methodology", "Metodologia");
      break;
    case 8:
      checkWords("introduction", "Introdução");
      checkCitationsIn("introduction");
      break;
    case 9:
      checkWords("results_discussion", "Resultados e discussão");
      checkCitationsIn("results_discussion");
      break;
    case 10:
      checkWords("conclusion", "Conclusão");
      break;
    case 11: {
      checkWords("references_list", "Referências");
      if (countWords(str(values["references_list"])) === 0) break;
      for (const { work, label } of referenceCheck(values).filter((r) => !r.found))
        problems.push(`Falta nas Referências: ${work.citation}, citado em ${label}.`);
      break;
    }
    case 13:
      if (!isCanvaUrl(str(values["banner_canva_url"])))
        problems.push("Cole o link do banner no Canva (começa com https://www.canva.com/).");
      else if (isTemplateLink(str(values["banner_canva_url"]), str(values["banner_template_url"])))
        problems.push(TEMPLATE_LINK_PROBLEM);
      if (!str(values["banner_file_path"])) problems.push("Anexe o arquivo final do banner (PDF ou imagem).");
      break;
    case 12: {
      checkWords("abstract", "Resumo");
      const kws = splitKeywords(str(values["keywords"]));
      if (kws.length < KEYWORDS_MIN || kws.length > KEYWORDS_MAX)
        problems.push(`Palavras-chave: ${kws.length}; use de ${KEYWORDS_MIN} a ${KEYWORDS_MAX}, separadas por ponto e vírgula.`);
      const repeated = keywordsInTitle(kws, str(values["title"]));
      if (repeated.length) problems.push(`Palavras-chave iguais ao título: ${repeated.join(", ")}.`);
      break;
    }
  }
  return problems;
}
