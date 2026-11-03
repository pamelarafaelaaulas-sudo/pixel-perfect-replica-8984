import { describe, expect, it } from "vitest";
import { FAIR_DOCS, accreditationComplete } from "./fair-docs";

describe("accreditationComplete", () => {
  it("needs every document checked", () => {
    const all = FAIR_DOCS.map((d) => ({ doc_type: d.key, status: "conferido" }));
    expect(accreditationComplete(all)).toBe(true);
    expect(accreditationComplete(all.slice(1))).toBe(false);
    expect(accreditationComplete([{ doc_type: all[0]!.doc_type, status: "enviado" }, ...all.slice(1)])).toBe(false);
  });
});
