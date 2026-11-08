import { describe, expect, it } from "vitest";
import { TEMPLATE_LINK_PROBLEM, countWords, isCanvaUrl, isTemplateLink, keywordsInTitle, phaseProblems } from "./phase-rules";
import { PHASES } from "./phases";

const words = (n: number) => Array.from({ length: n }, (_, i) => `palavra${i}`).join(" ");

describe("written project order", () => {
  it("follows the teacher's order, with Resumo last", () => {
    expect(PHASES.map((p) => p.name)).toEqual([
      "Tema",
      "Artigos científicos",
      "Pergunta norteadora",
      "Título",
      "Objetivo geral",
      "Objetivos específicos",
      "Metodologia",
      "Introdução",
      "Resultados e discussão",
      "Conclusão",
      "Referências",
      "Resumo",
      "Banner",
    ]);
  });
});

describe("banner delivery", () => {
  it("needs both a Canva link and the final file", () => {
    expect(phaseProblems(13, { banner_canva_url: "", banner_file_path: "" }, 0)).toHaveLength(2);
    expect(phaseProblems(13, { banner_canva_url: "https://www.canva.com/design/abc/view", banner_file_path: "" }, 0)).toHaveLength(1);
    expect(phaseProblems(13, { banner_canva_url: "https://www.canva.com/design/abc/view", banner_file_path: "g/b.pdf" }, 0)).toEqual([]);
  });

  it("blocks delivery when the group pasted the teacher's template link instead of its own copy", () => {
    const template = "https://www.canva.com/design/DAGmodelo1/abc/view?mode=preview";
    const sameDesign = "https://www.canva.com/design/DAGMODELO1/xyz/edit";
    const ownCopy = "https://www.canva.com/design/DAGcopia22/xyz/edit";
    expect(isTemplateLink(sameDesign, template)).toBe(true);
    expect(isTemplateLink(ownCopy, template)).toBe(false);
    expect(
      phaseProblems(13, { banner_canva_url: sameDesign, banner_template_url: template, banner_file_path: "g/b.pdf" }, 0),
    ).toEqual([TEMPLATE_LINK_PROBLEM]);
    expect(
      phaseProblems(13, { banner_canva_url: ownCopy, banner_template_url: template, banner_file_path: "g/b.pdf" }, 0),
    ).toEqual([]);
  });

  it("rejects links that are not from Canva", () => {
    expect(isCanvaUrl("https://drive.google.com/file/x")).toBe(false);
    expect(isCanvaUrl("http://www.canva.com/design/x")).toBe(false);
    expect(isCanvaUrl("https://canva.link/abc")).toBe(true);
  });
});

describe("delivery rules", () => {
  it("counts words separated by any whitespace", () => {
    expect(countWords("  um  dois\ntrês ")).toBe(3);
    expect(countWords("")).toBe(0);
  });

  it("blocks the guiding-question stage without a social application", () => {
    expect(phaseProblems(3, { guiding_question: "Por quê?" }, 0)).toEqual(["Preencha: Aplicação ou intervenção social."]);
    expect(phaseProblems(3, { guiding_question: "Por quê?", social_application: "Campanha no bairro" }, 0)).toEqual([]);
  });

  it("blocks a general objective over 50 words", () => {
    expect(phaseProblems(5, { general_objective: words(51) }, 0)).toHaveLength(1);
    expect(phaseProblems(5, { general_objective: words(50) }, 0)).toEqual([]);
  });

  it("blocks more than 5 specific objectives", () => {
    const six = Array.from({ length: 6 }, (_, i) => `Objetivo ${i}`).join("\n");
    expect(phaseProblems(6, { specific_objectives: six }, 0)).toHaveLength(1);
  });

  it("requires 250–750 words in the methodology", () => {
    expect(phaseProblems(7, { methodology: words(249), ethics_human_research: false }, 0)).toHaveLength(1);
    expect(phaseProblems(7, { methodology: words(250), ethics_human_research: false }, 0)).toEqual([]);
    expect(phaseProblems(7, { methodology: words(751), ethics_human_research: false }, 0)).toHaveLength(1);
  });

  it("requires 250–500 words in the introduction", () => {
    const cite = " (Silva, 2020) (Souza, 2019) (Lima, 2018) (Costa, 2021) (Rocha, 2022)."; // 10 words
    expect(phaseProblems(8, { introduction: words(491) + cite }, 0)).toHaveLength(1);
    expect(phaseProblems(8, { introduction: words(490) + cite }, 0)).toEqual([]);
  });

  it("limits the conclusion to 150 words", () => {
    expect(phaseProblems(10, { conclusion: words(151) }, 0)).toHaveLength(1);
  });

  it("requires a 150–250 word abstract and 3–5 keywords not taken from the title", () => {
    const ok = { abstract: words(150), keywords: "água; poluição; esgoto", title: "Óleo de cozinha no bairro" };
    expect(phaseProblems(12, ok, 0)).toEqual([]);
    expect(phaseProblems(12, { ...ok, abstract: words(149) }, 0)).toHaveLength(1);
    expect(phaseProblems(12, { ...ok, keywords: "água; poluição" }, 0)).toHaveLength(1);
    expect(phaseProblems(12, { ...ok, keywords: "agua; poluição; óleo de cozinha" }, 0)).toHaveLength(1);
  });

  it("finds keywords repeated in the title ignoring accents and case", () => {
    expect(keywordsInTitle(["Oleo", "solo"], "Descarte de óleo")).toEqual(["Oleo"]);
  });
});

describe("minimum citations and references", () => {
  const words = (n: number) => Array(n).fill("palavra").join(" ");
  it("introduction needs 5 distinct works; repeats count once", () => {
    const four = `${words(260)} (Silva, 2020) (Silva, 2020) (Souza, 2019) (Lima, 2018) (Costa, 2021).`;
    expect(phaseProblems(8, { introduction: four }, 0).some((p) => p.includes("o mínimo é 5"))).toBe(true);
    const five = `${four} (Rocha, 2022).`;
    expect(phaseProblems(8, { introduction: five }, 0).some((p) => p.includes("o mínimo é 5"))).toBe(false);
  });
  it("references need at least 5 lines", () => {
    const four = "SILVA, A. X. 2020.\nSOUZA, B. Y. 2019.\nLIMA, C. 2018.\nCOSTA, D. 2021.";
    expect(phaseProblems(11, { references_list: four }, 0).some((p) => p.includes("mínimo é 5"))).toBe(true);
    expect(phaseProblems(11, { references_list: four + "\nROCHA, E. 2022." }, 0).some((p) => p.includes("mínimo é 5"))).toBe(false);
  });
});

describe("articles stage", () => {
  it("blocks delivery with fewer than 5 sources", () => {
    expect(phaseProblems(2, {}, 4)).toHaveLength(1);
    expect(phaseProblems(2, {}, 5)).toEqual([]);
  });
});
