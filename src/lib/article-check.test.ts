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
