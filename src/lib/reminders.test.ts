import { describe, expect, it } from "vitest";
import { autoRunDue, buildReminders, normalizePhone, reminderParams, type ReminderInputClass } from "./reminders";
import { finalGrade } from "./penalty";

const now = new Date("2026-10-29T12:00:00Z");

const cls = (current: number, due: string, submitted: number[] = [], whatsapp = "67992870578"): ReminderInputClass => ({
  id: "c1",
  name: "9A",
  schedules: [{ phase_number: current, due_date: due }],
  groups: [
    {
      id: "g1",
      group_name: "Grupo Solo",
      projects: { current_phase: current, phase_submissions: submitted.map((n) => ({ phase_number: n })) },
      group_members: [{ student_id: "s1", whatsapp, profiles: { name: "Ana Clara Souza" } }],
    },
  ],
});

describe("WhatsApp stage reminders", () => {
  it("tells each student how many days are left on the group's current stage", () => {
    const { reminders } = buildReminders([cls(8, "2026-11-01T12:00:00Z")], now);
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({ phone: "5567992870578", phase: 8, phaseName: "Introdução", daysLeft: 3 });
    expect(reminderParams(reminders[0]!)).toEqual(["Ana", "3 dias", "Introdução", "01/11/2026 às 08:00"]);
  });

  it("skips overdue stages, finished projects and the teacher's own number", () => {
    expect(buildReminders([cls(8, "2026-10-28T12:00:00Z")], now).reminders).toHaveLength(0);
    expect(buildReminders([cls(13, "2026-12-01T12:00:00Z", [13])], now).reminders).toHaveLength(0);
    const own = buildReminders([cls(8, "2026-11-01T12:00:00Z", [], "67998125731")], now, { senderPhone: "+55 67 9812-5731" });
    expect(own.reminders).toHaveLength(0);
    expect(own.skipped[0]!.reason).toBe("É o número da professora");
  });

  it("normalizes Brazilian numbers and rejects invalid ones", () => {
    expect(normalizePhone("(67) 99287-0578")).toBe("5567992870578");
    expect(normalizePhone("+55 67 99287-0578")).toBe("5567992870578");
    expect(normalizePhone("12345")).toBeNull();
  });

  it("runs automatically again only after the chosen number of days (3 by default)", () => {
    expect(autoRunDue(null, 3, now)).toBe(true);
    expect(autoRunDue("2026-10-27T12:00:00Z", 3, now)).toBe(false);
    expect(autoRunDue("2026-10-26T12:00:00Z", 3, now)).toBe(true);
  });
});

describe("final grade with teacher adjustment", () => {
  it("is group grade − late penalty + adjustment, kept between 0 and 10", () => {
    expect(finalGrade(8, 1.5, 1)).toBe(7.5);
    expect(finalGrade(9.5, 0, 2)).toBe(10);
    expect(finalGrade(1, 2, -1)).toBe(0);
  });
});
