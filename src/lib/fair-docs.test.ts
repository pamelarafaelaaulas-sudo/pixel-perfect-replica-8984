import { describe, expect, it } from "vitest";
import { FAIR_DOCS, accreditationComplete, canDownloadFairBanner } from "./fair-docs";

describe("external fair banner models", () => {
  it("only releases the model after teacher approval", () => {
    expect(canDownloadFairBanner("aprovado")).toBe(true);
    expect(canDownloadFairBanner(undefined)).toBe(false);
    expect(canDownloadFairBanner(null)).toBe(false);
    expect(canDownloadFairBanner("ajustes")).toBe(false);
    expect(canDownloadFairBanner("recusado")).toBe(false);
  });
});

describe("accreditationComplete", () => {
  it("needs every document checked", () => {
    const all = FAIR_DOCS.map((d) => ({ doc_type: d.key, status: "conferido" }));
    expect(accreditationComplete(all)).toBe(true);
    expect(accreditationComplete(all.slice(1))).toBe(false);
    expect(accreditationComplete([{ doc_type: all[0]!.doc_type, status: "enviado" }, ...all.slice(1)])).toBe(false);
  });
});
