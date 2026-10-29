import { describe, expect, it } from "vitest";
import { ABNT, buildAbntModel, buildPlanModel, cmToTwip, docxFileName, sortReferences, splitInstitution, type AbntInput } from "./abnt-doc";

const base: AbntInput = {
  title: "Plantas da escola",
  institution: "Escola Estadual X, Cuiabá - MT",
  abstract: "Resumo.",
  keywords: "plantas; solo; água",
  general_objective: "Analisar.",
  specific_objectives: "- Medir\n2. Comparar",
  methodology: "Método.",
  introduction: "Primeiro.\n\nSegundo.",
  results_discussion: "Resultados.",
  conclusion: "Fim.",
  references_list: "SILVA, A. Livro. 2020.\nALMEIDA, B. Artigo. 2019.",
  authors: ["Ana Souza", "Bruno Lima"],
  teacherName: "Pâmela Prado",
  areaLabel: "Ciências Biológicas",
  projectCode: "BIO-2B-001",
  year: 2026,
};

describe("ABNT layout", () => {
  it("uses A4 with 3 cm top/left and 2 cm bottom/right margins", () => {
    expect(ABNT.page).toEqual({ widthCm: 21, heightCm: 29.7 });
    expect(ABNT.marginsCm).toEqual({ top: 3, left: 3, bottom: 2, right: 2 });
    expect(cmToTwip(3)).toBe(1701);
    expect(cmToTwip(2)).toBe(1134);
  });

  it("uses 12 pt text, 1.5 spacing and a 1.25 cm paragraph indent", () => {
    expect(ABNT.bodyPt).toBe(12);
    expect(ABNT.bodyLineSpacing).toBe(1.5);
    expect(ABNT.firstLineIndentCm).toBe(1.25);
  });
});

describe("ABNT document content", () => {
  it("numbers the sections in ABNT order", () => {
    const m = buildAbntModel(base);
    expect(m.sections.map((s) => `${s.number} ${s.title}`)).toEqual([
      "1 INTRODUÇÃO",
      "2 OBJETIVOS",
      "2.1 OBJETIVO GERAL",
      "2.2 OBJETIVOS ESPECÍFICOS",
      "3 METODOLOGIA",
      "4 RESULTADOS E DISCUSSÃO",
      "5 CONCLUSÃO",
    ]);
  });

  it("splits paragraphs and strips typed bullets from objectives", () => {
    const m = buildAbntModel(base);
    expect(m.sections[0]!.paragraphs).toEqual(["Primeiro.", "Segundo."]);
    expect(m.sections[3]!.items).toEqual(["Medir", "Comparar"]);
  });

  it("lists references in alphabetical order", () => {
    expect(sortReferences(base.references_list)).toEqual(["ALMEIDA, B. Artigo. 2019.", "SILVA, A. Livro. 2020."]);
  });

  it("fills the cover with institution, authors, title, code, city and year", () => {
    const m = buildAbntModel(base);
    expect(m.cover).toEqual({
      institution: "ESCOLA ESTADUAL X",
      authors: ["ANA SOUZA", "BRUNO LIMA"],
      title: "PLANTAS DA ESCOLA",
      code: "BIO-2B-001",
      place: "CUIABÁ - MT",
      year: "2026",
    });
    expect(m.titlePage.nature).toBe(
      "Projeto de iniciação científica apresentado à Escola Estadual X, na área de Ciências Biológicas, sob orientação da Profa. Pâmela Prado.",
    );
  });

  it("lists empty parts", () => {
    const m = buildAbntModel({ ...base, conclusion: " ", references_list: null });
    expect(m.missing).toEqual(["Conclusão", "Referências"]);
  });

  it("splits institution and city", () => {
    expect(splitInstitution("Escola A")).toEqual({ name: "Escola A", place: null });
  });

  it("builds a safe file name", () => {
    expect(docxFileName("BIO-2B-001", "Grupo", "Água: uso?")).toBe("BIO-2B-001 - Água uso.docx");
    expect(docxFileName(null, "Plantas", null)).toBe("Plantas - Projeto.docx");
  });
});

describe("project plan document", () => {
  const plan = {
    theme: "Óleo de cozinha",
    guiding_question: "Como o óleo afeta a água?",
    social_application: "Pontos de coleta de óleo na escola.",
    title: "Óleo e água",
    institution: "Escola X, Cuiabá - MT",
    general_objective: "Analisar.",
    specific_objectives: "Medir\nComparar",
    methodology: "Método.",
    scientific_articles: [{ title: "Artigo", url: "", source_type: "Artigo", abnt_citation: "SILVA, A. Óleo. 2020." }],
    authors: ["Ana"],
    teacherName: "Pâmela Prado",
    areaLabel: null,
    projectCode: null,
    year: 2026,
  };

  it("includes the social application right after the guiding question", () => {
    const m = buildPlanModel(plan);
    expect(m.sections.map((s) => s.title).slice(0, 3)).toEqual(["TEMA", "PERGUNTA NORTEADORA", "APLICAÇÃO OU INTERVENÇÃO SOCIAL"]);
    expect(m.sections[2]!.paragraphs).toEqual(["Pontos de coleta de óleo na escola."]);
    expect(m.abstract).toBeNull();
    expect(m.references).toEqual(["SILVA, A. Óleo. 2020."]);
  });

  it("lists an empty social application as missing", () => {
    expect(buildPlanModel({ ...plan, social_application: "" }).missing).toContain("Aplicação ou intervenção social");
  });
});
