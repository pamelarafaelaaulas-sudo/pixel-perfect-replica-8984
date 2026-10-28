/**
 * Delivery rules for each stage, from the teacher's specification document.
 * A stage can only be delivered when every check passes.
 * The database (phase_rule_problem in submit_phase) enforces the same word limits.
 */

export type WordLimit = { min: number; max: number | null };

/** Word limits per field. min 1 = required. */
export const WORD_LIMITS: Partial<Record<string, WordLimit>> = {
  theme: { min: 1, max: null },
  guiding_question: { min: 1, max: null },
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
      break;
    case 9:
      checkWords("results_discussion", "Resultados e discussão");
      break;
    case 10:
      checkWords("conclusion", "Conclusão");
      break;
    case 11:
      checkWords("references_list", "Referências");
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
