import { describe, expect, it } from "vitest";
import { groupMedalRanking, poolMedals, stageMedals, studentMedalRanking, tallyMedals } from "./medals";

const due = "2026-03-10T23:59:00-04:00";
const schedules = [{ phase_number: 1, due_date: due }];
const at = (day: number, hour = 10) => `2026-03-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00-04:00`;

describe("stage medals", () => {
  it("gives gold, silver and bronze to the first three on-time groups and Honra ao Mérito to the rest", () => {
    const medals = stageMedals(schedules, [
      { group_id: "d", phase_number: 1, submitted_at: at(9) },
      { group_id: "a", phase_number: 1, submitted_at: at(1) },
      { group_id: "c", phase_number: 1, submitted_at: at(5) },
      { group_id: "b", phase_number: 1, submitted_at: at(3) },
      { group_id: "e", phase_number: 1, submitted_at: at(10, 20) },
    ]);
    expect(medals.map((m) => [m.groupId, m.kind])).toEqual([
      ["a", "ouro"],
      ["b", "prata"],
      ["c", "bronze"],
      ["d", "honra"],
      ["e", "honra"],
    ]);
  });

  it("gives no medal to a late delivery, even if it was among the first three", () => {
    const medals = stageMedals(schedules, [
      { group_id: "late", phase_number: 1, submitted_at: at(11) },
      { group_id: "ok", phase_number: 1, submitted_at: at(10) },
    ]);
    expect(medals).toEqual([{ groupId: "ok", phase: 1, kind: "ouro", at: at(10) }]);
  });

  it("gives no medal on a stage without a deadline", () => {
    expect(stageMedals([], [{ group_id: "a", phase_number: 1, submitted_at: at(1) }])).toEqual([]);
  });
});

describe("competing classes", () => {
  const cls = (id: string, pool: string | null, day: number) => ({
    id,
    name: id,
    medal_pool: pool,
    schedules,
    groups: [{ id: `g-${id}`, name: id, members: [], submissions: [{ phase_number: 1, submitted_at: at(day) }] }],
  });
  it("classes with the same pool share one podium", () => {
    const m = poolMedals([cls("A", "Manhã", 2), cls("B", "manhã", 1)]);
    expect(m.map((x) => [x.groupId, x.kind])).toEqual([
      ["g-B", "ouro"],
      ["g-A", "prata"],
    ]);
  });
  it("a class without a pool competes alone", () => {
    const m = poolMedals([cls("A", null, 2), cls("B", null, 1)]);
    expect(m.map((x) => x.kind)).toEqual(["ouro", "ouro"]);
  });
});

describe("medal points and ranking", () => {
  it("counts gold 3, silver 2, bronze 1 and Honra ao Mérito 0,5", () => {
    expect(tallyMedals([{ kind: "ouro" }, { kind: "prata" }, { kind: "bronze" }, { kind: "honra" }]).points).toBe(6.5);
  });

  it("ranks by points and lets ties share the position", () => {
    const medals = [
      { groupId: "a", phase: 1, kind: "ouro" as const, at: "" },
      { groupId: "b", phase: 1, kind: "prata" as const, at: "" },
      { groupId: "c", phase: 1, kind: "prata" as const, at: "" },
    ];
    const r = groupMedalRanking(
      [
        { id: "c", name: "C" },
        { id: "b", name: "B" },
        { id: "a", name: "A" },
        { id: "z", name: "Z" },
      ],
      medals,
    );
    expect(r.map((x) => [x.id, x.position])).toEqual([
      ["a", 1],
      ["b", 2],
      ["c", 2],
      ["z", 4],
    ]);
  });

  it("gives every group member the group's medals", () => {
    const r = studentMedalRanking([
      {
        id: "t",
        name: "1A",
        schedules,
        groups: [
          { id: "g", name: "G", members: [{ id: "s1", name: "Ana" }, { id: "s2", name: "Bia" }], submissions: [{ phase_number: 1, submitted_at: at(1) }] },
        ],
      },
    ]);
    expect(r.map((x) => [x.name, x.tally.ouro, x.position])).toEqual([
      ["Ana", 1, 1],
      ["Bia", 1, 1],
    ]);
  });
});
