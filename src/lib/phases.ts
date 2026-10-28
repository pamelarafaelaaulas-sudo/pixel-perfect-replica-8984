/**
 * Project stages, in delivery order. Stages 1–3 are planning; stages 4–12 are the parts
 * of the written project ("Projeto escrito"), each with its own deadline.
 * Guidance and limits follow the teacher's specification document.
 */
export const PHASES = [
  { number: 1, name: "Tema", hint: "Escolham e descrevam o tema que o grupo vai investigar." },
  { number: 2, name: "Artigos científicos", hint: "Reúnam artigos e fontes confiáveis sobre o tema, com a citação em ABNT." },
  { number: 3, name: "Pergunta norteadora", hint: "Formulem a pergunta que o projeto vai tentar responder." },
  {
    number: 4,
    name: "Título",
    hint: "Título do projeto, instituição onde ele é desenvolvido e a área/subárea. Os nomes do grupo e da orientadora entram automaticamente.",
  },
  {
    number: 5,
    name: "Objetivo geral",
    hint: "Único e conciso: é a questão principal do projeto de pesquisa. Máximo de 50 palavras, sem gráficos ou imagens.",
  },
  {
    number: 6,
    name: "Objetivos específicos",
    hint: "Etapas necessárias para alcançar o objetivo geral, escritas com assertividade (as fases, não a descrição do processo). No máximo 5, um por linha, até 100 palavras no total. Sem caixa alta.",
  },
  {
    number: 7,
    name: "Metodologia",
    hint: "Descreva com clareza todas as etapas de desenvolvimento: teorias metodológicas escolhidas e por quê, escolhas, informações e o passo a passo para cumprir os objetivos. De 250 a 750 palavras. Pode ter gráficos, imagens e tabelas.",
  },
  {
    number: 8,
    name: "Introdução",
    hint: "Apresente e contextualize o projeto: o problema/pergunta observado, a hipótese (quando houver) e a justificativa da pesquisa, citando os autores nas normas ABNT. De 250 a 500 palavras. Sem caixa alta.",
  },
  {
    number: 9,
    name: "Resultados e discussão",
    hint: "Os dados obtidos em cada etapa da metodologia e a discussão deles (positivos ou não), comparando com as referências (citações obrigatórias nas normas ABNT). Se ainda não houver resultados, descreva os esperados e chame o tópico de \"Resultados parciais/esperados e discussão\". De 250 a 750 palavras.",
  },
  {
    number: 10,
    name: "Conclusão",
    hint: "Responda ao objetivo geral a partir da discussão dos resultados, sintetizando os destaques da pesquisa, sem trazer conceitos ou objetivos novos. Máximo de 150 palavras.",
  },
  {
    number: 11,
    name: "Referências",
    hint: "Todas as referências citadas no projeto, em ordem alfabética, conforme a ABNT (NBR 6023/2023). Uma por linha.",
  },
  {
    number: 12,
    name: "Resumo",
    hint: "Linguagem objetiva e acadêmica, com introdução, área e tema, objetivo(s), metodologia e resultados alcançados ou esperados. De 150 a 250 palavras, sem caixa alta, imagens, tabelas ou gráficos. Depois, de 3 a 5 palavras-chave separadas por ponto e vírgula, diferentes das usadas no título.",
  },
] as const;

export const PHASE_COUNT = PHASES.length;
/** First stage that belongs to the written project. */
export const WRITTEN_START = 4;
export const isWrittenPart = (n: number) => n >= WRITTEN_START;

export type TextFieldKey =
  | "theme"
  | "guiding_question"
  | "title"
  | "institution"
  | "area_subarea"
  | "general_objective"
  | "specific_objectives"
  | "methodology"
  | "introduction"
  | "results_discussion"
  | "conclusion"
  | "references_list"
  | "abstract"
  | "keywords";

export const TEXT_FIELDS: TextFieldKey[] = [
  "theme",
  "guiding_question",
  "title",
  "institution",
  "area_subarea",
  "general_objective",
  "specific_objectives",
  "methodology",
  "introduction",
  "results_discussion",
  "conclusion",
  "references_list",
  "abstract",
  "keywords",
];

export type FormField = {
  key: TextFieldKey;
  label: string;
  rows: number;
  placeholder?: string;
  optional?: boolean;
};

/** The fields students fill in for each text stage (stage 2 uses the articles editor). */
export const PHASE_FORM: Record<number, FormField[]> = {
  1: [{ key: "theme", label: "Tema do projeto", rows: 5, placeholder: "Sobre o que o grupo vai pesquisar e por quê?" }],
  3: [
    {
      key: "guiding_question",
      label: "Pergunta norteadora",
      rows: 4,
      placeholder: "Ex.: De que forma o descarte de óleo de cozinha afeta a qualidade da água do bairro?",
    },
  ],
  4: [
    { key: "title", label: "Título", rows: 1 },
    { key: "institution", label: "Instituição de desenvolvimento, cidade - UF", rows: 1, placeholder: "Ex.: Escola Estadual X, Cuiabá - MT", optional: true },
    { key: "area_subarea", label: "Área - Subárea", rows: 1, placeholder: "Ex.: Ciências Biológicas - Ecologia", optional: true },
  ],
  5: [{ key: "general_objective", label: "Objetivo geral", rows: 3 }],
  6: [{ key: "specific_objectives", label: "Objetivos específicos (um por linha)", rows: 6 }],
  7: [{ key: "methodology", label: "Metodologia", rows: 14 }],
  8: [{ key: "introduction", label: "Introdução", rows: 12 }],
  9: [{ key: "results_discussion", label: "Resultados e discussão", rows: 14 }],
  10: [{ key: "conclusion", label: "Conclusão", rows: 6 }],
  11: [{ key: "references_list", label: "Referências (uma por linha, em ordem alfabética)", rows: 10 }],
  12: [
    { key: "abstract", label: "Resumo", rows: 10 },
    { key: "keywords", label: "Palavras-chave (separadas por ponto e vírgula)", rows: 1, placeholder: "Ex.: água; poluição; óleo de cozinha" },
  ],
};

/** Fields saved by each stage (used to know whether the current stage has unsaved edits). */
export function phaseFields(n: number): string[] {
  if (n === 2) return ["scientific_articles"];
  return (PHASE_FORM[n] ?? []).map((f) => f.key);
}

export const SECTION_LABELS: Record<string, string> = {
  scientific_articles: "Artigos científicos",
  ...Object.fromEntries(Object.values(PHASE_FORM).flat().map((f) => [f.key, f.label.replace(/ \(.*\)$/, "")])),
};

export const SOURCE_TYPES = [
  "Artigo científico",
  "Livro",
  "Site institucional",
  "Tese / dissertação",
  "Outro",
] as const;

export type Article = {
  title: string;
  url: string;
  source_type: string;
  abnt_citation: string;
};

export function parseArticles(value: unknown): Article[] {
  if (!Array.isArray(value)) return [];
  return value.map((a) => {
    const o = (a ?? {}) as Record<string, unknown>;
    return {
      title: String(o["title"] ?? ""),
      url: String(o["url"] ?? ""),
      source_type: String(o["source_type"] ?? SOURCE_TYPES[0]),
      abnt_citation: String(o["abnt_citation"] ?? ""),
    };
  });
}

export const TRIMESTERS = [1, 2, 3] as const;

export function phaseMeta(n: number) {
  return PHASES[n - 1] ?? PHASES[0];
}
