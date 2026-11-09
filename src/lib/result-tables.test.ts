import { describe, expect, it } from "vitest";
import { emptyTable, parsePastedTable, tableCaption, tableProblems } from "./result-tables";

describe("result tables", () => {
  it("numbers captions ABNT-style", () => {
    expect(tableCaption(0, "pH da água")).toBe("Tabela 1 – pH da água");
  });
  it("blocks a table without title or data", () => {
    expect(tableProblems([emptyTable()])).toHaveLength(2);
    const ok = { title: "pH", source: "", rows: [["A", "B"], ["1", "2"]] };
    expect(tableProblems([ok])).toEqual([]);
  });
  it("reads tables pasted from Excel and Markdown", () => {
    expect(parsePastedTable("A\tB\n1\t2")).toEqual([["A", "B"], ["1", "2"]]);
    expect(parsePastedTable("| A | B |\n|---|---|\n| 1 | 2 |")).toEqual([["A", "B"], ["1", "2"]]);
    expect(parsePastedTable("texto comum")).toBeNull();
  });
});
