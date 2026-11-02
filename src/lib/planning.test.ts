import { describe, expect, it } from "vitest";
import { deadlineLabel, groupProgress, planningOverview } from "./planning";
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

describe("group progress", () => {
  const schedules = [
    { phase_number: 1, due_date: "2026-05-07T12:00:00Z" },
    { phase_number: 2, due_date: "2026-05-08T12:00:00Z" },
    { phase_number: 3, due_date: "2026-05-20T12:00:00Z" },
    { phase_number: 8, due_date: "2026-05-09T12:00:00Z" },
  ];

  it("lists what is still missing and charges each late day only on its own bimestre", () => {
    const [g] = groupProgress({
      now,
      perDay: 0.5,
      schedules,
      groups: [
        {
          id: "a",
          name: "Alfa",
          currentPhase: 2,
          // Tema delivered 2 days late; Artigos (current) 2 days overdue and not delivered.
          submissions: [{ phase_number: 1, submitted_at: "2026-05-09T12:00:00Z" }],
        },
      ],
    });
    expect(g!.missing[0]).toMatchObject({ phase: 2, status: "late_open", daysLate: 2 });
    expect(g!.missing.map((m) => m.phase)).toEqual(Array.from({ length: PHASE_COUNT - 1 }, (_, i) => i + 2));
    expect(g!.lateOpen).toBe(1);
    const b1 = g!.bimesters.find((b) => b.bimester === 1)!;
    expect(b1).toMatchObject({ delivered: 1, daysLate: 4, penalty: 2 });
    // Introdução (2º bimestre) is overdue too, but it costs only the 2º bimestre.
    expect(g!.bimesters.find((b) => b.bimester === 2)).toMatchObject({ daysLate: 1, penalty: 0.5 });
    expect(g!.totalPenalty).toBe(2.5);
  });

  it("does not list stages the teacher released as missing", () => {
    const [g] = groupProgress({
      now,
      perDay: 0.5,
      schedules,
      groups: [{ id: "b", name: "Beta", currentPhase: 3, submissions: [] }],
    });
    expect(g!.missing.some((m) => m.phase === 1 || m.phase === 2)).toBe(false);
    expect(g!.missing[0]).toMatchObject({ phase: 3, status: "in_progress" });
  });
});
