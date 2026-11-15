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

import { articleCitationHint as ach, buildAbntReference as bar, citationHint as ch } from "./article-links";
import { describe as d2, expect as e2, it as i2 } from "vitest";
d2("teen-friendly ABNT", () => {
  i2("reads lowercase / natural names", () => {
    e2(ch("Silva, Mariana; Souza, Carlos. Plástico. Revista X, 2023.")?.parenthetical).toBe("(Silva; Souza, 2023)");
    e2(ach({ authors: "Mariana Silva e Carlos Souza", year: "2023", abnt_citation: "" })?.narrative).toBe("Silva e Souza (2023)");
  });
  i2("builds ABNT from simple fields", () => {
    e2(bar({ authors: "Mariana Silva e Carlos Souza", year: "2023", title: "Plástico", journal: "Revista X", url: "" }))
      .toBe("SILVA, Mariana; SOUZA, Carlos. Plástico. Revista X, 2023.");
  });
});
