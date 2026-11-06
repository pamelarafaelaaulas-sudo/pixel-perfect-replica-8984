import { describe, it, expect } from "vitest";
import { attendeeProblem, isValidCpf, formatCpf } from "./fair-attendees";

const base = { full_name: "Ana Souza", cpf: "529.982.247-25", birth_date: "2000-01-01", shirt_size: "M", whatsapp: "65999998888", guardian_name: "", guardian_phone: "", dietary: "" };

describe("fair attendees", () => {
  it("validates CPF", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(formatCpf("52998224725")).toBe("529.982.247-25");
  });
  it("adult ok without guardian", () => expect(attendeeProblem(base)).toBeNull());
  it("minor needs guardian", () =>
    expect(attendeeProblem({ ...base, birth_date: "2012-05-05" }, new Date("2026-11-06"))).toMatch(/responsável/));
});
