import { describe, expect, it } from "vitest";
import { ethicsProblems, isGoogleFormUrl, normalizeFairs, tcleDocument, imageConsentDocument } from "./ethics";
import { phaseProblems } from "./phase-rules";

const words = (n: number) => Array.from({ length: n }, () => "palavra").join(" ");

describe("external fairs", () => {
  it("offers FETEC/MS and FECINTEC, one or both, only when the group says yes", () => {
    expect(normalizeFairs(true, ["FECINTEC", "FETEC/MS"])).toEqual(["FETEC/MS", "FECINTEC"]);
    expect(normalizeFairs(true, ["FECINTEC"])).toEqual(["FECINTEC"]);
    expect(normalizeFairs(false, ["FETEC/MS"])).toEqual([]);
  });
});

describe("ethics screening in the Metodologia", () => {
  const base = { ethics_collection: [], ethics_form_url: null };

  it("blocks delivery until the human-research question is answered", () => {
    expect(ethicsProblems({ ...base, ethics_human_research: null })).toHaveLength(1);
    expect(phaseProblems(7, { methodology: words(300) }, 0)).toHaveLength(1);
  });

  it("'Não' follows the normal flow", () => {
    expect(ethicsProblems({ ...base, ethics_human_research: false })).toEqual([]);
    expect(phaseProblems(7, { methodology: words(300), ethics_human_research: false }, 0)).toEqual([]);
  });

  it("'Sim' requires choosing online and/or presencial", () => {
    expect(ethicsProblems({ ...base, ethics_human_research: true })).toHaveLength(1);
    expect(ethicsProblems({ ...base, ethics_human_research: true, ethics_collection: ["presencial"] })).toEqual([]);
  });

  it("online collection requires the group's own Google Forms link", () => {
    const online = { ethics_human_research: true, ethics_collection: ["online"] };
    expect(ethicsProblems({ ...online, ethics_form_url: "" })).toHaveLength(1);
    expect(ethicsProblems({ ...online, ethics_form_url: "https://exemplo.com/form" })).toHaveLength(1);
    expect(ethicsProblems({ ...online, ethics_form_url: "https://forms.gle/abc123" })).toEqual([]);
    expect(
      ethicsProblems({
        ...online,
        ethics_form_url: "https://docs.google.com/forms/d/MODELO/copy",
        ethics_form_template_url: "https://docs.google.com/forms/d/MODELO/copy/",
      }),
    ).toHaveLength(1);
  });

  it("recognizes Google Forms links", () => {
    expect(isGoogleFormUrl("https://docs.google.com/forms/d/e/x/viewform")).toBe(true);
    expect(isGoogleFormUrl("https://forms.gle/x")).toBe(true);
    expect(isGoogleFormUrl("https://drive.google.com/x")).toBe(false);
  });
});

describe("consent documents", () => {
  const input = {
    title: "Água da chuva",
    projectCode: "BIO-9A-01",
    institution: "Escola X",
    students: ["Bia", "Ana"],
    teacherName: "Pâmela",
    objective: "Avaliar o pH.",
    year: 2026,
  };
  it("fills the TCLE with the project data and signature lines", () => {
    const d = tcleDocument(input);
    expect(d.paragraphs.join(" ")).toContain("Água da chuva (código BIO-9A-01)");
    expect(d.paragraphs.join(" ")).toContain("Ana, Bia");
    expect(d.signatures.length).toBeGreaterThanOrEqual(2);
  });
  it("has an image and voice authorization", () => {
    expect(imageConsentDocument(input).title).toBe("TERMO DE AUTORIZAÇÃO DE USO DE IMAGEM E VOZ");
  });
});
