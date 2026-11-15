/**
 * Links the stage-2 articles to the Introdução and the Referências: citation hints, reference
 * import and the cross audit. Pure; warnings only — delivery blocking stays in phase-rules.
 */
import { citedWorks, missingReferences, normalizeText, workKey, type CitedWork } from "./citations";
import type { Article } from "./phases";

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();

const PARTICLES = new Set(["da", "de", "do", "das", "dos", "e", "di", "van", "von"]);
const SUFFIX = new Set(["junior", "júnior", "jr", "filho", "neto", "sobrinho"]);

/** Splits a typed author list ("Mariana Silva e Carlos Souza", "Silva, M.; Souza, C.") into people. */
function splitAuthors(raw: string): string[] {
  const t = raw.replace(/\bet\s+al\.?/gi, "").trim();
  const parts = t.includes(";") ? t.split(";") : t.split(/\s*(?:,\s*e\s+|\s+e\s+|\s*&\s*|\s+and\s+)\s*/i);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** Surname of one person, accepting "SILVA, M.", "Silva, Mariana" or "Mariana Silva" (any case). */
function surnameOf(person: string): string | null {
  const p = person.trim().replace(/\.$/, "");
  if (!p) return null;
  let s: string;
  if (p.includes(",")) s = p.split(",")[0]!.trim();
  else {
    const words = p.split(/\s+/).filter((w) => !PARTICLES.has(w.toLowerCase()));
    if (!words.length) return null;
    let last = words[words.length - 1]!;
    if (SUFFIX.has(last.toLowerCase().replace(".", "")) && words.length > 1) last = words[words.length - 2]!;
    s = last;
  }
  if (!/^[\p{L}'’\- ]+$/u.test(s) || s.length < 2) return null;
  return s.split(/\s+/).map(cap).join(" ");
}

/** Builds the ABNT reference from the simple fields: "SILVA, Mariana; SOUZA, Carlos. Título. Revista, 2023. Disponível em: url." */
export function buildAbntReference(a: { authors?: string; year?: string; title: string; journal?: string; url: string }): string {
  const people = splitAuthors(a.authors ?? "").map((person) => {
    const p = person.replace(/\.$/, "").trim();
    if (p.includes(",")) {
      const [sn, ...rest] = p.split(",");
      return `${sn!.trim().toUpperCase()}, ${rest.join(",").trim()}`.replace(/,\s*$/, "");
    }
    const sn = surnameOf(p);
    if (!sn) return p;
    const idx = p.toLowerCase().lastIndexOf(sn.toLowerCase());
    const given = p.slice(0, idx).trim();
    return given ? `${sn.toUpperCase()}, ${given}` : sn.toUpperCase();
  });
  const year = (a.year ?? "").match(/(?:19|20)\d{2}/)?.[0] ?? "";
  const bits = [people.join("; "), a.title.trim().replace(/\.$/, ""), [a.journal?.trim(), year].filter(Boolean).join(", ")].filter(Boolean);
  const ref = bits.map((b) => b + ".").join(" ");
  return a.url.trim() ? `${ref} Disponível em: ${a.url.trim()}.` : ref;
}

/** "SILVA, A.; SOUZA, B. Título. 2020." → surnames ["Silva","Souza"] and year "2020". Tolerant of case and separators. */
export function referenceAuthors(ref: string): { surnames: string[]; year: string | null } {
  const years = [...ref.matchAll(/(?:^|\D)((?:19|20)\d{2})(?!\d)/g)].map((m) => m[1]!);
  const year = years.length ? years[years.length - 1]! : null;
  const head = ref.split(/\.\s+(?=[\p{Lu}\p{Ll}"“(])/u)[0] ?? "";
  const surnames = splitAuthors(head).map(surnameOf).filter((s): s is string => !!s);
  return { surnames, year };
}

/** Citation hint from the article's simple fields first, then from its ABNT text. */
export function articleCitationHint(a: { authors?: string; year?: string; abnt_citation: string }) {
  if (a.authors?.trim() && a.year?.trim()) {
    const h = citationHint(`${splitAuthors(a.authors).join("; ")}. x. ${a.year}`);
    if (h) return h;
  }
  return citationHint(a.abnt_citation);
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
