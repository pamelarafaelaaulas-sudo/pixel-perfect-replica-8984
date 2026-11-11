import { describe, expect, it } from "vitest";
import { brMobileProblem } from "./phone";
describe("brMobileProblem", () => {
  it("accepts a real Cuiabá mobile", () => expect(brMobileProblem("(65) 99231-4567")).toBeNull());
  it("accepts +55 prefix", () => expect(brMobileProblem("+55 67 99287-0578")).toBeNull());
  it("rejects nonexistent DDD", () => expect(brMobileProblem("(20) 99231-4567")).not.toBeNull());
  it("rejects missing ninth digit", () => expect(brMobileProblem("(65) 3231-4567")).not.toBeNull());
  it("rejects repeated digits", () => expect(brMobileProblem("(65) 99999-9999")).not.toBeNull());
  it("rejects sequences", () => expect(brMobileProblem("(65) 91234-5678")).not.toBeNull());
});
