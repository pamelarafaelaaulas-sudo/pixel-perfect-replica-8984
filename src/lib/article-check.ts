/**
 * Anti-fake checks for the stage-2 sources (pure, tested). Mirrored, a bit looser, by SQL
 * `article_problem` called from `phase_rule_problem_base` stage 2. Also DOI helpers for Crossref.
 */
import type { Article } from "./phases";

export const MIN_TITLE_CHARS = 15;
export const MIN_YEAR = 1970;

const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const KEYBOARD = ["qwert", "asdfg", "zxcvb", "12345", "abcde", "hjkl", "poiuy", "lkjhg"];
const FAKE_WORDS = new Set(["teste", "test", "artigo", "trabalho", "qualquer", "qualquer coisa", "nada", "oi", "oioi", "xxx", "aaa", "eu", "aluno", "aluna", "professora", "professor", "autor", "nao sei", "sei la"]);

/** True for keyboard mashing, repeated letters or placeholder words. */
export function looksFake(text: string): boolean {
  const t = norm(text);
  if (!t) return true;
  if (FAKE_WORDS.has(t)) return true;
  if (/(.)\1{3,}/.test(t.replace(/\s/g, ""))) return true;
  const compact = t.replace(/\s/g, "");
  return KEYBOARD.some((k) => compact.includes(k));
}

export function isHttpsUrl(url: string): boolean {
  return /^https?:\/\/[^\s/]+\.[^\s/]{2,}\S*$/i.test(url.trim());
}

/** DOI found in a link or typed text ("10.1590/abc", "https://doi.org/10.1590/abc"). */
export function extractDoi(text: string): string | null {
  const m = text.match(/10\.\d{4,9}\/[^\s"<>]+/i);
  return m ? m[0].replace(/[.,;)]+$/, "") : null;
}

function memberMatch(authors: string, members: string[]): string | null {
  const a = norm(authors);
  for (const m of members) {
    const n = norm(m);
    if (n.split(" ").length < 2) continue;
    const [first, ...rest] = n.split(" ");
    const last = rest[rest.length - 1]!;
    if (a.includes(n) || (a.includes(first!) && a.includes(last))) return m;
  }
  return null;
}

/** Problems for one source. Empty = looks like a real publication. */
export function articleProblems(a: Article, members: string[], currentYear = new Date().getFullYear()): string[] {
  const p: string[] = [];
  const title = a.title.trim();
  if (title.length < MIN_TITLE_CHARS || title.split(/\s+/).filter(Boolean).length < 3)
    p.push(`o título precisa do nome completo do estudo (pelo menos ${MIN_TITLE_CHARS} letras e 3 palavras).`);
  else if (looksFake(title)) p.push("o título parece inventado ou digitado ao acaso.");
  if (!isHttpsUrl(a.url ?? "")) p.push("cole o link completo da fonte, começando com https://.");
  const authors = (a.authors ?? "").trim();
  if (!authors && !a.abnt_citation.trim()) p.push("informe os autores (nome e sobrenome).");
  if (authors) {
    if (authors.split(/\s+/).filter((w) => w.replace(/[^\p{L}]/gu, "").length >= 2).length < 2 || looksFake(authors))
      p.push("os autores precisam ter nome e sobrenome reais (ex.: Mariana Silva).");
    const who = memberMatch(authors, members);
    if (who) p.push(`o autor não pode ser integrante do grupo (${who}). Coloque os pesquisadores que publicaram o estudo.`);
  }
  const yearText = (a.year ?? "").trim() || a.abnt_citation.match(/(?:19|20)\d{2}/)?.[0] || "";
  const year = Number(yearText);
  if (!yearText) p.push("informe o ano de publicação.");
  else if (!(year >= MIN_YEAR && year <= currentYear)) p.push(`o ano precisa estar entre ${MIN_YEAR} e ${currentYear}.`);
  return p;
}

/** Delivery-blocking list for all sources, labeled "Fonte N: ...". */
export function articlesProblems(list: Article[], members: string[], currentYear?: number): string[] {
  return list.flatMap((a, i) => articleProblems(a, members, currentYear).map((m) => `Fonte ${i + 1}: ${m}`));
}

export type CrossrefWork = { title: string; authors: string; year: string; journal: string; doi: string };

/** Looks up a DOI in Crossref (free, public). Null when it doesn't exist. */
export async function lookupDoi(doi: string): Promise<CrossrefWork | null> {
  const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("crossref");
  const m = (await r.json()).message as {
    title?: string[]; author?: { given?: string; family?: string; name?: string }[];
    issued?: { "date-parts"?: number[][] }; "container-title"?: string[]; DOI: string;
  };
  return {
    title: m.title?.[0] ?? "",
    authors: (m.author ?? []).map((x) => x.name ?? [x.given, x.family].filter(Boolean).join(" ")).filter(Boolean).join("; "),
    year: String(m.issued?.["date-parts"]?.[0]?.[0] ?? ""),
    journal: m["container-title"]?.[0] ?? "",
    doi: m.DOI,
  };
}
