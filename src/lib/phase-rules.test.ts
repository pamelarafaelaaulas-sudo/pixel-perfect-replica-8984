import { describe, expect, it } from "vitest";
import { countWords, keywordsInTitle, phaseProblems } from "./phase-rules";
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

  it("blocks a general objective over 50 words", () => {
    expect(phaseProblems(5, { general_objective: words(51) }, 0)).toHaveLength(1);
    expect(phaseProblems(5, { general_objective: words(50) }, 0)).toEqual([]);
  });

  it("blocks more than 5 specific objectives", () => {
    const six = Array.from({ length: 6 }, (_, i) => `Objetivo ${i}`).join("\n");
    expect(phaseProblems(6, { specific_objectives: six }, 0)).toHaveLength(1);
  });

  it("requires 250–750 words in the methodology", () => {
    expect(phaseProblems(7, { methodology: words(249) }, 0)).toHaveLength(1);
    expect(phaseProblems(7, { methodology: words(250) }, 0)).toEqual([]);
    expect(phaseProblems(7, { methodology: words(751) }, 0)).toHaveLength(1);
  });

  it("requires 250–500 words in the introduction", () => {
    const cite = " (Silva, 2020)."; // 2 words
    expect(phaseProblems(8, { introduction: words(499) + cite }, 0)).toHaveLength(1);
    expect(phaseProblems(8, { introduction: words(498) + cite }, 0)).toEqual([]);
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
