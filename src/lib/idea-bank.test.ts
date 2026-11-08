import { describe, expect, it } from "vitest";
import { ideaTakenBy } from "./idea-bank";

const uses = [{ groupId: "g1", classId: "c1", label: "Grupo 1 (A)" }];
describe("ideaTakenBy", () => {
  it("blocks another group of the same class", () => expect(ideaTakenBy(uses, "g2", "c1")?.groupId).toBe("g1"));
  it("does not block the group that chose it", () => expect(ideaTakenBy(uses, "g1", "c1")).toBeUndefined());
  it("does not block groups of other classes", () => expect(ideaTakenBy(uses, "g3", "c2")).toBeUndefined());
});
