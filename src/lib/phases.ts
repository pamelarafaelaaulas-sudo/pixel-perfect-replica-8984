export const PHASES = [
  { number: 1, name: "Tema", hint: "Escolham e descrevam o tema que o grupo vai investigar." },
  {
    number: 2,
    name: "Artigos científicos",
    hint: "Reúnam artigos e fontes confiáveis sobre o tema, com a citação em ABNT.",
  },
  {
    number: 3,
    name: "Pergunta norteadora",
    hint: "Formulem a pergunta que o projeto vai tentar responder.",
  },
  {
    number: 4,
    name: "Projeto escrito",
    hint: "Escrevam o projeto completo, seção por seção.",
  },
] as const;

export type PhaseNumber = 1 | 2 | 3 | 4;

export const WRITTEN_SECTIONS = [
  { key: "title", label: "Título", rows: 1 },
  { key: "general_objective", label: "Objetivo geral", rows: 3 },
  { key: "specific_objectives", label: "Objetivos específicos", rows: 4 },
  { key: "introduction", label: "Introdução", rows: 8 },
  { key: "methodology", label: "Metodologia", rows: 8 },
  { key: "results_discussion", label: "Resultados e discussão", rows: 8 },
  { key: "references_list", label: "Referências", rows: 6 },
] as const;

export type WrittenSectionKey = (typeof WRITTEN_SECTIONS)[number]["key"];

export const SECTION_LABELS: Record<string, string> = {
  theme: "Tema",
  scientific_articles: "Artigos científicos",
  guiding_question: "Pergunta norteadora",
  ...Object.fromEntries(WRITTEN_SECTIONS.map((s) => [s.key, s.label])),
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
      title: String(o.title ?? ""),
      url: String(o.url ?? ""),
      source_type: String(o.source_type ?? SOURCE_TYPES[0]),
      abnt_citation: String(o.abnt_citation ?? ""),
    };
  });
}

export const TRIMESTERS = [1, 2, 3] as const;
