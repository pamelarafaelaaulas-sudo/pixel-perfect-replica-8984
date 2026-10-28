import { describe, expect, it } from "vitest";
import { checkCitations } from "./citations";
import { phaseProblems } from "./phase-rules";

const words = (n: number) => Array.from({ length: n }, (_, i) => `palavra${i}`).join(" ");

describe("ABNT citations", () => {
  it.each([
    "A água fica contaminada (Silva, 2020).",
    "Como mostra (Silva, 2020, p. 15).",
    "Isso já foi visto (Silva; Souza, 2021).",
    "Isso já foi visto (Araújo et al., 2019).",
    "Dados oficiais (IBGE, 2023).",
    "Vários estudos (Silva, 2020; Souza, 2021).",
    "Segundo Silva (2020), a água fica contaminada.",
    "Silva e Souza (2021, p. 3) afirmam que...",
    "Conforme Pellis et al. (2018), ...",
  ])("accepts %s", (text) => {
    expect(checkCitations(text).citations.length).toBeGreaterThan(0);
    expect(checkCitations(text).issues).toEqual([]);
  });

  it("finds no citation in plain text or a year in parentheses alone", () => {
    expect(checkCitations("Em 2020 (no verão) a água subiu.").citations).toEqual([]);
  });

  it.each(["(Silva 2020)", "(Silva et al, 2020)", "(Silva e Souza, 2020)", "(Silva & Souza, 2020)"])(
    "points out the mistake in %s",
    (text) => {
      expect(checkCitations(text).issues).toHaveLength(1);
    },
  );
});

describe("citation rule for Introdução and Resultados e discussão", () => {
  it("blocks the introduction without any ABNT citation", () => {
    expect(phaseProblems(8, { introduction: words(300) }, 0)).toHaveLength(1);
  });

  it("lets the introduction through with a correct citation", () => {
    expect(phaseProblems(8, { introduction: `${words(300)} (Silva, 2020).` }, 0)).toEqual([]);
  });

  it("blocks results with a citation written outside the norm", () => {
    const text = `${words(300)} (Silva, 2020). Outro dado (Souza 2021).`;
    expect(phaseProblems(9, { results_discussion: text }, 0)).toHaveLength(1);
  });

  it("does not require citations in other parts", () => {
    expect(phaseProblems(7, { methodology: words(300) }, 0)).toEqual([]);
  });
});
