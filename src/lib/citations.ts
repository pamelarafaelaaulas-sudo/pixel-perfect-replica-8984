/**
 * In-text citation check for the ABNT author-date system (NBR 10520:2023).
 * Accepted:  (Silva, 2020)  (Silva, 2020, p. 15)  (Silva; Souza, 2021)  (Silva et al., 2019)
 *            (IBGE, 2023)   (Silva, 2020; Souza, 2021)   Silva (2020)   Silva e Souza (2021, p. 3)
 * The database mirrors a looser version of "has at least one citation" in phase_rule_problem.
 */

const NAME = String.raw`[\p{Lu}][\p{L}'’\-]*`;
const PARTICLE = String.raw`(?:de|da|do|das|dos|del|van|von)`;
// Inside parentheses authors are separated by ";", so "e" is not part of a name there.
const NAME_FULL_P = String.raw`${NAME}(?:\s+(?:${PARTICLE}|${NAME}))*(?:\s*\[\.\.\.\])?`;
const NAME_FULL_N = String.raw`${NAME}(?:\s+(?:${PARTICLE}|e|${NAME}))*`;
const ET_AL = String.raw`(?:\s+et\s+al\.)?`;
const YEAR = String.raw`\d{4}[a-z]?`;
const LOC = String.raw`(?:,\s*(?:p|local|cap|slide)\.\s*[\w\-–]+)?`;
const ONE = String.raw`${NAME_FULL_P}(?:\s*;\s*${NAME_FULL_P})*${ET_AL},\s*${YEAR}${LOC}`;

const PARENTHETICAL = new RegExp(String.raw`\(\s*${ONE}(?:\s*;\s*${ONE})*\s*\)`, "gu");
const NARRATIVE = new RegExp(String.raw`${NAME_FULL_N}${ET_AL}\s+\(${YEAR}${LOC}\)`, "gu");

const ISSUES: { re: RegExp; fix: string }[] = [
  {
    re: new RegExp(String.raw`\(\s*${NAME}(?:\s+et\s+al\.?)?\s+${YEAR}\s*\)`, "gu"),
    fix: "Falta a vírgula antes do ano. Ex.: (Silva, 2020).",
  },
  {
    re: new RegExp(String.raw`\(\s*${NAME}\s+et\s+al\s*,`, "gu"),
    fix: "Use “et al.” com ponto. Ex.: (Silva et al., 2020).",
  },
  {
    re: new RegExp(String.raw`\(\s*${NAME}\s+(?:e|&)\s+${NAME}[^()]*,\s*${YEAR}[^()]*\)`, "gu"),
    fix: "Dentro dos parênteses, separe os autores com ponto e vírgula. Ex.: (Silva; Souza, 2020).",
  },
];

export type CitationCheck = {
  citations: string[];
  issues: { text: string; fix: string }[];
};

export function checkCitations(text: string | null | undefined): CitationCheck {
  const t = text ?? "";
  const citations = [...t.matchAll(PARENTHETICAL), ...t.matchAll(NARRATIVE)].map((m) => m[0].trim());
  const issues: CitationCheck["issues"] = [];
  for (const { re, fix } of ISSUES) {
    for (const m of t.matchAll(re)) {
      if (!issues.some((i) => i.text === m[0])) issues.push({ text: m[0], fix });
    }
  }
  return { citations, issues };
}

/** One cited work: the citation as written, its author part and its year. */
export type CitedWork = { citation: string; authors: string; year: string };

const STARTERS = new Set(
  "segundo conforme para como em no na nos nas ja assim ainda porem entao logo tambem alem apos com sobre entretanto contudo".split(" "),
);

const IN_PAREN_YEAR = /,\s*(\d{4})[a-z]?(?:,\s*(?:p|local|cap|slide)\.\s*[\w\-–]+)?/gu;

/** Every work cited in a text, one entry per author+year (a citation can list several works). */
export function citedWorks(text: string | null | undefined): CitedWork[] {
  const t = text ?? "";
  const out: CitedWork[] = [];
  for (const m of t.matchAll(PARENTHETICAL)) {
    const inner = m[0].trim().slice(1, -1);
    let start = 0;
    for (const y of inner.matchAll(IN_PAREN_YEAR)) {
      const authors = inner.slice(start, y.index).replace(/^\s*;\s*/, "").trim();
      out.push({ citation: m[0].trim(), authors, year: y[1]! });
      start = (y.index ?? 0) + y[0].length;
    }
  }
  for (const m of t.matchAll(NARRATIVE)) {
    let c = m[0].trim();
    // A sentence often starts with a capitalized connector ("Segundo Silva (2020)"): drop it.
    const first = /^(\p{L}+)\s+/u.exec(c);
    if (first && STARTERS.has(normalizeText(first[1]!))) c = c.slice(first[0].length);
    out.push({ citation: c, authors: c.slice(0, c.lastIndexOf("(")).trim(), year: /\((\d{4})/.exec(c)![1]! });
  }
  return out;
}

export const normalizeText = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const NOT_A_NAME = new Set(["de", "da", "do", "das", "dos", "del", "van", "von", "e", "et", "al"]);

const authorWords = (w: CitedWork) =>
  normalizeText(w.authors)
    .split(" ")
    .filter((x) => x.length >= 2 && !NOT_A_NAME.has(x));

/** Same key for the same work written two ways, e.g. "(Silva, 2020)" and "Silva (2020, p. 3)". */
export const workKey = (w: CitedWork) => `${authorWords(w).join(" ")}|${w.year}`;

/**
 * Cited works with no matching line in the reference list. A line matches when it has the
 * citation's year and at least one of its author words (ABNT lists start with the surname in
 * capitals, e.g. "SILVA, J. ... 2020."). Lenient on purpose so a correct list never gets blocked.
 */
export function missingReferences(works: CitedWork[], referencesText: string | null | undefined): CitedWork[] {
  const lines = (referencesText ?? "")
    .split("\n")
    .map((l) => ` ${normalizeText(l)} `)
    .filter((l) => l.trim() !== "");
  const seen = new Set<string>();
  return works.filter((w) => {
    const words = authorWords(w);
    const key = workKey(w);
    if (seen.has(key)) return false;
    seen.add(key);
    const yearRe = new RegExp(String.raw`(^|\D)${w.year}(\D|$)`);
    return !lines.some((l) => yearRe.test(l) && words.some((x) => l.includes(` ${x} `)));
  });
}

export const CITATION_EXAMPLES = [
  { label: "Paráfrase, com o autor entre parênteses", example: "O óleo descartado na pia contamina a água dos rios (Silva, 2020)." },
  { label: "Paráfrase, com o autor na frase", example: "Segundo Silva (2020), o óleo descartado na pia contamina a água dos rios." },
  { label: "Dois ou três autores", example: "(Silva; Souza, 2021) ou Silva e Souza (2021)" },
  { label: "Quatro autores ou mais", example: "(Silva et al., 2019) ou Silva et al. (2019)" },
  { label: "Instituição ou órgão", example: "(IBGE, 2023) ou (Organização Mundial da Saúde, 2022)" },
  {
    label: "Citação direta (trecho copiado, até 3 linhas): entre aspas e com a página",
    example: "“O descarte inadequado compromete o tratamento de esgoto” (Silva, 2020, p. 15).",
  },
] as const;
