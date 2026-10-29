import { describe, expect, it } from "vitest";
import { deadlineLabel, planningOverview } from "./planning";
import { PHASE_COUNT } from "./phases";

const now = new Date("2026-05-10T12:00:00Z");

describe("planning overview", () => {
  it("describes how far each deadline is", () => {
    expect(deadlineLabel("2026-05-13T12:00:00Z", now)).toBe("vence em 3 dias");
    expect(deadlineLabel("2026-05-08T12:00:00Z", now)).toBe("venceu há 2 dias");
    expect(deadlineLabel(null, now)).toBe("sem prazo");
  });

  it("lists every stage and counts deliveries and late groups", () => {
    const { stages, groups } = planningOverview({
      now,
      schedules: [
        { phase_number: 1, due_date: "2026-05-01T23:59:00Z" },
        { phase_number: 2, due_date: "2026-05-05T23:59:00Z" },
      ],
      groups: [
        { id: "a", name: "Alfa", currentPhase: 2, submissions: [{ phase_number: 1, submitted_at: "2026-04-30T10:00:00Z" }] },
        { id: "b", name: "Beta", currentPhase: 1, submissions: [] },
      ],
    });
    expect(stages).toHaveLength(PHASE_COUNT);
    expect(stages[0]).toMatchObject({ delivered: 1, late: 1, groups: 2 });
    expect(stages[1]).toMatchObject({ delivered: 0, late: 2 });
    expect(groups.map((g) => g.delivered)).toEqual([1, 0]);
  });
});
