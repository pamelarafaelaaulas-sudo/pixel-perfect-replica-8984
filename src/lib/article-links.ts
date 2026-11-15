/**
 * Links the stage-2 articles to the Introdução and the Referências: citation hints, reference
 * import and the cross audit. Pure; warnings only — delivery blocking stays in phase-rules.
 */
import { citedWorks, missingReferences, normalizeText, workKey, type CitedWork } from "./citations";
import type { Article } from "./phases";

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();

/** "SILVA, A.; SOUZA, B. Título. 2020." → surnames ["Silva","Souza"] and year "2020". */
export function referenceAuthors(ref: string): { surnames: string[]; year: string | null } {
  const years = [...ref.matchAll(/(?:^|\D)((?:19|20)\d{2})(?!\d)/g)].map((m) => m[1]!);
  const year = years.length ? years[years.length - 1]! : null;
  const head = ref.split(/\.\s+(?=[\p{Lu}\p{Ll}])/u)[0] ?? "";
  const surnames = head
    .split(";")
    .map((a) => a.split(",")[0]!.trim())
    .filter((s) => /^[\p{Lu}][\p{L}'’\- ]+$/u.test(s) && s === s.toUpperCase())
    .map((s) => s.split(/\s+/).map(cap).join(" "));
  return { surnames, year };
}

/** How to cite one reference in the text, ABNT author-date. Null when the reference can't be read. */
export function citationHint(ref: string): { parenthetical: string; narrative: string } | null {
  const { surnames, year } = referenceAuthors(ref);
  if (!year || surnames.length === 0) return null;
  if (surnames.length >= 4) return { parenthetical: `(${surnames[0]} et al., ${year})`, narrative: `${surnames[0]} et al. (${year})` };
  const last = surnames[surnames.length - 1];
  const narr = surnames.length === 1 ? surnames[0] : `${surnames.slice(0, -1).join(", ")} e ${last}`;
  return { parenthetical: `(${surnames.join("; ")}, ${year})`, narrative: `${narr} (${year})` };
}

const refLines = (t: string | null | undefined) => (t ?? "").split("\n").map((l) => l.trim()).filter(Boolean);

/** Reference list with the articles' ABNT references added (only the ones not already listed). */
export function importArticleReferences(articles: Article[], current: string | null | undefined): { text: string; added: number } {
  const lines = refLines(current);
  const have = new Set(lines.map(normalizeText));
  const add = articles.map((a) => a.abnt_citation.trim()).filter((r) => r && !have.has(normalizeText(r)));
  const unique = add.filter((r, i) => add.findIndex((x) => normalizeText(x) === normalizeText(r)) === i);
  return { text: [...lines, ...unique].join("\n"), added: unique.length };
}

/** Works cited in the text that match none of the student's registered articles. */
export function citationsWithoutArticle(text: string | null | undefined, articles: Article[]): CitedWork[] {
  const refs = articles.map((a) => a.abnt_citation).join("\n");
  return missingReferences(citedWorks(text), refs);
}

/** Reference lines that no citation in the given texts points to (listed but never cited). */
export function uncitedReferences(referencesText: string | null | undefined, texts: (string | null | undefined)[]): string[] {
  const works = texts.flatMap((t) => citedWorks(t));
  const seen = new Set<string>();
  const unique = works.filter((w) => (seen.has(workKey(w)) ? false : (seen.add(workKey(w)), true)));
  return refLines(referencesText).filter((line) => missingReferences(unique, line).length === unique.length);
}
