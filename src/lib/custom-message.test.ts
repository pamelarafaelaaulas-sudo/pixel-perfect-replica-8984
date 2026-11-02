import { describe, expect, it } from "vitest";
import { cleanCustomText, customMessageProblems, customParams, messageRecipients, type ReminderInputClass } from "./reminders";

const classes: ReminderInputClass[] = [
  {
    id: "c1",
    name: "9A",
    schedules: [],
    groups: [
      {
        id: "g1",
        group_name: "Grupo Água",
        projects: { current_phase: 4, phase_submissions: [] },
        group_members: [
          { student_id: "s1", whatsapp: "67992870578", profiles: { name: "Ana Clara" } },
          { student_id: "s2", whatsapp: "123", profiles: { name: "Bruno" } },
          { student_id: "s3", whatsapp: "67 99812-5731", profiles: { name: "Pâmela" } },
        ],
      },
    ],
  },
];

describe("WhatsApp custom message", () => {
  it("lists every student with a valid number, even with no stage deadline ahead", () => {
    const { recipients, skipped } = messageRecipients(classes, { senderPhone: "5567998125731" });
    expect(recipients.map((r) => r.studentId)).toEqual(["s1"]);
    expect(skipped.map((s) => s.reason)).toEqual(["WhatsApp inválido", "É o número da professora"]);
  });

  it("blocks sending with no text, over 600 characters or nobody selected", () => {
    expect(customMessageProblems("  ", 1)).toEqual(["Escreva a mensagem."]);
    expect(customMessageProblems("a".repeat(601), 1)[0]).toContain("máximo é 600");
    expect(customMessageProblems("Oi", 0)).toEqual(["Escolha pelo menos um aluno."]);
    expect(customMessageProblems("Oi", 2)).toEqual([]);
  });

  it("removes line breaks WhatsApp refuses and uses the first name", () => {
    expect(cleanCustomText("Tragam o banner.\n\nAula   de quinta.")).toBe("Tragam o banner. · Aula de quinta.");
    expect(customParams("Ana Clara Souza", "Oi\nturma")).toEqual(["Ana", "Oi · turma"]);
  });
});
