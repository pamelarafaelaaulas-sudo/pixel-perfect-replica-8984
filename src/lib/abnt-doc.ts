import { objectiveLines, splitKeywords } from "./phase-rules";

/**
 * ABNT (NBR 14724) layout for the written project. Pure values so the rules are testable;
 * `abnt-docx.ts` turns them into a Word file.
 */
export const ABNT = {
  /** A4 in centimetres. */
  page: { widthCm: 21, heightCm: 29.7 },
  /** Top/left 3 cm, bottom/right 2 cm. */
  marginsCm: { top: 3, left: 3, bottom: 2, right: 2 },
  /** Page number sits 2 cm from the top edge, at the right. */
  headerCm: 2,
  font: "Arial",
  bodyPt: 12,
  smallPt: 10,
  /** Body text 1.5; abstract, references and the title-page note single-spaced. */
  bodyLineSpacing: 1.5,
  firstLineIndentCm: 1.25,
  /** "Nature of the work" note on the title page starts at the middle of the text area. */
  natureIndentCm: 8,
} as const;

/** Word measures in twips (1/1440 inch). */
export const cmToTwip = (cm: number) => Math.round((cm / 2.54) * 1440);

export type AbntInput = {
  title: string | null;
  institution: string | null;
  abstract: string | null;
  keywords: string | null;
  general_objective: string | null;
  specific_objectives: string | null;
  methodology: string | null;
  introduction: string | null;
  results_discussion: string | null;
  conclusion: string | null;
  references_list: string | null;
  authors: string[];
  teacherName: string | null;
  areaLabel: string | null;
  projectCode: string | null;
  year: number;
};

export type AbntSection = {
  /** "1", "2.1"… */
  number: string;
  title: string;
  level: 1 | 2;
  paragraphs: string[];
  /** Alíneas (a), b)…) — used for the specific objectives. */
  items?: string[];
};

export type AbntModel = {
  cover: { institution: string; authors: string[]; title: string; code: string | null; place: string; year: string };
  titlePage: { authors: string[]; title: string; nature: string; place: string; year: string };
  abstract: { paragraphs: string[]; keywords: string[] };
  sections: AbntSection[];
  references: string[];
  /** Parts still empty, in document order (shown to the user before downloading). */
  missing: string[];
};

export const paragraphsOf = (text: string | null | undefined) =>
  (text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

/** "Escola Estadual X, Cuiabá - MT" → name + place. */
export function splitInstitution(raw: string | null | undefined): { name: string | null; place: string | null } {
  const t = (raw ?? "").trim();
  if (!t) return { name: null, place: null };
  const i = t.lastIndexOf(",");
  if (i < 0) return { name: t, place: null };
  return { name: t.slice(0, i).trim() || null, place: t.slice(i + 1).trim() || null };
}

/** Strips bullets/numbering the students typed, so the document can number the items as alíneas. */
const stripMarker = (l: string) => l.replace(/^(\s*([-•*–]|\d+[.)]|[a-zA-Z][.)])\s+)/, "").trim();

/** ABNT lists references in alphabetical order. */
export function sortReferences(text: string | null | undefined) {
  return paragraphsOf(text).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
}

export const alinea = (i: number) => `${String.fromCharCode(97 + (i % 26))})`;

export function buildAbntModel(p: AbntInput): AbntModel {
  const missing: string[] = [];
  const need = (label: string, value: string | null | undefined) => {
    if (!(value ?? "").trim()) missing.push(label);
  };
  need("Título", p.title);
  need("Instituição", p.institution);
  need("Resumo", p.abstract);
  need("Palavras-chave", p.keywords);
  need("Introdução", p.introduction);
  need("Objetivo geral", p.general_objective);
  need("Objetivos específicos", p.specific_objectives);
  need("Metodologia", p.methodology);
  need("Resultados e discussão", p.results_discussion);
  need("Conclusão", p.conclusion);
  need("Referências", p.references_list);

  const inst = splitInstitution(p.institution);
  const title = (p.title ?? "").trim() || "Título do projeto";
  const place = inst.place ?? "";
  const year = String(p.year);
  const authors = p.authors.filter(Boolean);

  const nature = [
    `Projeto de iniciação científica apresentado ${inst.name ? `à ${inst.name}` : "à feira de ciências"}`,
    p.areaLabel ? `, na área de ${p.areaLabel}` : "",
    p.teacherName ? `, sob orientação da Profa. ${p.teacherName}` : "",
    ".",
  ].join("");

  return {
    cover: {
      institution: (inst.name ?? "").toUpperCase(),
      authors: authors.map((a) => a.toUpperCase()),
      title: title.toUpperCase(),
      code: p.projectCode,
      place: place.toUpperCase(),
      year,
    },
    titlePage: { authors: authors.map((a) => a.toUpperCase()), title: title.toUpperCase(), nature, place: place.toUpperCase(), year },
    abstract: { paragraphs: paragraphsOf(p.abstract), keywords: splitKeywords(p.keywords) },
    sections: [
      { number: "1", title: "INTRODUÇÃO", level: 1, paragraphs: paragraphsOf(p.introduction) },
      { number: "2", title: "OBJETIVOS", level: 1, paragraphs: [] },
      { number: "2.1", title: "OBJETIVO GERAL", level: 2, paragraphs: paragraphsOf(p.general_objective) },
      {
        number: "2.2",
        title: "OBJETIVOS ESPECÍFICOS",
        level: 2,
        paragraphs: [],
        items: objectiveLines(p.specific_objectives).map(stripMarker).filter(Boolean),
      },
      { number: "3", title: "METODOLOGIA", level: 1, paragraphs: paragraphsOf(p.methodology) },
      { number: "4", title: "RESULTADOS E DISCUSSÃO", level: 1, paragraphs: paragraphsOf(p.results_discussion) },
      { number: "5", title: "CONCLUSÃO", level: 1, paragraphs: paragraphsOf(p.conclusion) },
    ],
    references: sortReferences(p.references_list),
    missing,
  };
}

/** File name safe for Windows/Mac: "BIO-2B-001 - Título.docx". */
export function docxFileName(code: string | null, groupName: string, title: string | null) {
  const base = [code ?? groupName, (title ?? "").trim() || "Projeto"].join(" - ");
  return `${base.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim().slice(0, 120)}.docx`;
}
