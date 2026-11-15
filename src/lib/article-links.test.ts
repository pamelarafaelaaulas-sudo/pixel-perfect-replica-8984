import { describe, expect, it } from "vitest";
import { citationHint, importArticleReferences, citationsWithoutArticle, uncitedReferences } from "./article-links";
import type { Article } from "./phases";

const art = (abnt_citation: string): Article => ({ title: "", url: "", source_type: "Artigo", abnt_citation });
const silva = "SILVA, A. Óleo na água. Revista X, 2020.";
const duo = "SOUZA, B.; LIMA, C. Rios urbanos. 2021.";

describe("article links", () => {
  it("builds ABNT citation hints from a reference", () => {
    expect(citationHint(silva)).toEqual({ parenthetical: "(Silva, 2020)", narrative: "Silva (2020)" });
    expect(citationHint(duo)?.parenthetical).toBe("(Souza; Lima, 2021)");
  });
  it("imports only the articles not already listed", () => {
    const r = importArticleReferences([art(silva), art(duo)], silva);
    expect(r.added).toBe(1);
    expect(r.text.split("\n")).toEqual([silva, duo]);
  });
  it("flags citations that match no registered article", () => {
    const out = citationsWithoutArticle("Texto (Silva, 2020) e (Rocha, 2019).", [art(silva)]);
    expect(out.map((w) => w.authors)).toEqual(["Rocha"]);
  });
  it("flags references never cited in the text", () => {
    expect(uncitedReferences(`${silva}\n${duo}`, ["Como diz Silva (2020)."])).toEqual([duo]);
  });
});
