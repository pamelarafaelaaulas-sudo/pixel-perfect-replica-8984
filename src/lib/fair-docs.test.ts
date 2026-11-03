import { describe, expect, it } from "vitest";
import { FAIR_DOCS, accreditationComplete } from "./fair-docs";

describe("accreditationComplete", () => {
  it("needs every document checked", () => {
    const all = FAIR_DOCS.map((d) => ({ doc_type: d.key, status: "conferido" }));
    expect(accreditationComplete(all)).toBe(true);
    expect(accreditationComplete(all.slice(1))).toBe(false);
    expect(accreditationComplete([{ ...all[0], status: "enviado" }, ...all.slice(1)])).toBe(false);
  });
});
