import { describe, expect, it } from "vitest";
import { studentAlerts, type AlertInput } from "./alerts";
import { fairIndicators, indicatorsCsv, type IndicatorProject } from "./indicators";

const now = new Date("2026-05-10T12:00:00Z");
const base: AlertInput = {
  now, currentPhase: 2, schedules: [], submittedPhases: [1], bannerReviews: [], writtenReviews: [],
  lastDiaryDate: "2026-05-09", diaryRequired: true, ethicsHumanResearch: null, ethicsProblems: 0, bannerGraded: false,
};

describe("student alerts", () => {
  it("red when current deadline is within 48h or passed", () => {
    const soon = studentAlerts({ ...base, schedules: [{ phase_number: 2, due_date: "2026-05-11T12:00:00Z" }] });
    expect(soon[0].tone).toBe("red");
    const late = studentAlerts({ ...base, schedules: [{ phase_number: 2, due_date: "2026-05-08T12:00:00Z" }] });
    expect(late[0].title).toMatch(/vencido/);
    const far = studentAlerts({ ...base, schedules: [{ phase_number: 2, due_date: "2026-05-20T12:00:00Z" }] });
    expect(far.some((a) => a.tone === "red")).toBe(false);
  });
  it("red for a banner returned with corrections", () => {
    const a = studentAlerts({ ...base, bannerReviews: [{ resubmit_due_at: "2026-05-30T00:00:00Z", resubmitted_at: null }] });
    expect(a[0]).toMatchObject({ tone: "red" });
  });
  it("yellow when diary has no entry for more than 7 days", () => {
    expect(studentAlerts({ ...base, lastDiaryDate: "2026-05-02" }).some((a) => a.tone === "yellow" && /Diário/.test(a.title))).toBe(true);
    expect(studentAlerts({ ...base, lastDiaryDate: "2026-05-04" }).some((a) => /Diário/.test(a.title))).toBe(false);
  });
  it("yellow for a pending written resubmission, green for approved ethics", () => {
    const a = studentAlerts({ ...base, writtenReviews: [{ phase_number: 8, resubmit_due_at: "2026-05-30T00:00:00Z", resubmitted_at: null }], ethicsHumanResearch: true });
    expect(a.find((x) => /Reenvio/.test(x.title))?.tone).toBe("yellow");
    expect(a.find((x) => /TCLE/.test(x.title))?.tone).toBe("green");
  });
});

const p = (o: Partial<IndicatorProject>): IndicatorProject => ({
  className: "1A", groupName: "G", area: "BIO", members: 3, currentPhase: 5, fairsInterest: false, fairs: [],
  ethicsHuman: null, ethicsCollection: [], ethicsFormUrl: null, ethicsTemplate: null, peerScores: [], ...o,
});

describe("fair indicators", () => {
  it("computes ethics compliance, fair adhesion and satisfaction", () => {
    const r = fairIndicators([
      p({ ethicsHuman: false, fairsInterest: true, fairs: ["FETEC/MS"], peerScores: [5, 4] }),
      p({ ethicsHuman: true, ethicsCollection: ["online"], fairsInterest: true, fairs: ["FETEC/MS", "FECINTEC"], peerScores: [3] }),
      p({}),
    ]);
    expect(r.totalProjects).toBe(3);
    expect(r.totalStudents).toBe(9);
    expect(r.ethicsCompliance).toBe(50);
    expect(r.ethicsPending).toBe(1);
    expect(r.fairs.map((f) => f.value)).toEqual([1, 0, 1, 1]);
    expect(r.satisfaction).toBe(4);
  });
  it("CSV uses ; and one line per project", () => {
    const csv = indicatorsCsv([p({}), p({ groupName: "B;C" })]);
    expect(csv.split("\n")).toHaveLength(3);
    expect(csv).toContain('"B;C"');
  });
});
