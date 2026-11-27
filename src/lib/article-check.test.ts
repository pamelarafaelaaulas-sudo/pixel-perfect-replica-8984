import { describe, expect, it } from "vitest";
import { articleProblems, extractDoi } from "./article-check";

const ok = { title: "Uso de óleo de cozinha na produção de sabão", url: "https://www.scielo.br/j/x", source_type: "Artigo", abnt_citation: "", authors: "Mariana Silva e Carlos Souza", year: "2021" };
const members = ["Maria Geovana Marendaz Dinis", "João Pedro Lima"];

describe("articleProblems", () => {
  it("accepts a real-looking source", () => expect(articleProblems(ok, members, 2026)).toEqual([]));
  it("blocks a group member as author", () =>
    expect(articleProblems({ ...ok, authors: "João Lima" }, members, 2026).join()).toMatch(/integrante/));
  it("blocks short or fake titles", () => {
    expect(articleProblems({ ...ok, title: "artigo" }, members, 2026)).toHaveLength(1);
    expect(articleProblems({ ...ok, title: "asdfgh qwerty zxcvbn teste" }, members, 2026)).toHaveLength(1);
  });
  it("requires an https link", () => expect(articleProblems({ ...ok, url: "google" }, members, 2026)).toHaveLength(1));
  it("requires name and surname", () => expect(articleProblems({ ...ok, authors: "eu" }, members, 2026)).toHaveLength(1));
  it("year between 1970 and the current year", () => {
    expect(articleProblems({ ...ok, year: "1969" }, members, 2026)).toHaveLength(1);
    expect(articleProblems({ ...ok, year: "2027" }, members, 2026)).toHaveLength(1);
    expect(articleProblems({ ...ok, year: "2026" }, members, 2026)).toEqual([]);
  });
});

describe("extractDoi", () => {
  it("reads DOI from a link", () => expect(extractDoi("https://doi.org/10.1590/s0100-40422012000100001.")).toBe("10.1590/s0100-40422012000100001"));
  it("null without DOI", () => expect(extractDoi("https://site.com/x")).toBeNull());
});

import { articleProblems as ap2 } from "./article-check";
describe("unverified DOI", () => {
  const base = { title: "Qualidade da água em rios urbanos", url: "https://doi.org/10.1590/abc123", authors: "Mariana Silva", year: "2020", abnt_citation: "", source_type: "Artigo" } as never;
  it("blocks a DOI not confirmed in Crossref", () => {
    expect(ap2(base, [], 2026).some((m) => m.includes("DOI"))).toBe(true);
  });
  it("accepts a verified DOI", () => {
    expect(ap2({ ...(base as object), doi_verified: true } as never, [], 2026).some((m) => m.includes("DOI"))).toBe(false);
  });
});

import { duplicateOf as _dup } from "./article-check";
describe("duplicate sources in the group", () => {
  const base = { title: "Efeito da temperatura no crescimento de plantas", url: "https://scielo.br/a/1", authors: "Ana Souza", year: "2020", abnt_citation: "" } as never;
  const mk = (o: object) => ({ ...(base as object), ...o }) as never;
  it("blocks same link", () => expect(_dup([base, mk({ title: "Outro estudo diferente aqui" , url: "http://www.scielo.br/a/1/" })], 1)).toBe(0));
  it("blocks same DOI from different links", () => expect(_dup([mk({ url: "https://doi.org/10.1590/abc" }), mk({ title: "Outro estudo diferente aqui", url: "https://x.org/10.1590/ABC" })], 1)).toBe(0));
  it("blocks same title with small variations", () => expect(_dup([base, mk({ url: "https://b.org/x", title: "efeito da temperatura no crescimento de plantas." })], 1)).toBe(0));
  it("allows different works", () => expect(_dup([base, mk({ url: "https://b.org/x", title: "Outro estudo diferente aqui" })], 1)).toBe(-1));
});
