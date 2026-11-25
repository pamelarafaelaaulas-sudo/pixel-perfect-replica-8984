import { describe, expect, it } from "vitest";
import { aiTextMarker } from "./ai-text";

describe("aiTextMarker", () => {
  it("blocks chatbot openings", () => {
    expect(aiTextMarker("Claro! Aqui está uma introdução sobre a água.")).not.toBeNull();
  });
  it("blocks 'como um modelo de linguagem'", () => {
    expect(aiTextMarker("Como um modelo de linguagem, não posso.")).not.toBeNull();
  });
  it("blocks bracket placeholders", () => {
    expect(aiTextMarker("Segundo [inserir autor], a água...")).not.toBeNull();
  });
  it("blocks markdown bold", () => {
    expect(aiTextMarker("**Introdução** A água é vital.")).not.toBeNull();
  });
  it("accepts normal student writing", () => {
    expect(aiTextMarker("A água do rio Cuiabá foi analisada pelo grupo (Silva, 2020).")).toBeNull();
  });
});
