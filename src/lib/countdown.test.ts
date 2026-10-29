import { describe, expect, it } from "vitest";
import { countdown, pickFair } from "./countdown";

describe("fair countdown", () => {
  it("splits the time left into days, hours, minutes and seconds", () => {
    const now = new Date("2026-10-29T10:00:00Z");
    const fair = new Date("2026-11-03T13:25:30Z");
    expect(countdown(fair, now)).toEqual({ days: 5, hours: 3, minutes: 25, seconds: 30, started: false });
  });

  it("stops at zero once the fair starts", () => {
    const fair = new Date("2026-11-03T13:00:00Z");
    expect(countdown(fair, new Date("2026-11-04T00:00:00Z"))).toEqual({
      days: 0, hours: 0, minutes: 0, seconds: 0, started: true,
    });
  });

  it("uses the soonest fair still ahead, named FECITI/MS by default", () => {
    const now = new Date("2026-10-29T00:00:00Z");
    const f = pickFair(
      [
        { fair_at: "2026-12-01T12:00:00Z", fair_name: "Outra" },
        { fair_at: "2026-11-10T12:00:00Z", fair_name: null },
        { fair_at: null, fair_name: "FECITI/MS" },
      ],
      now,
    );
    expect(f?.name).toBe("FECITI/MS");
    expect(f?.at.toISOString()).toBe("2026-11-10T12:00:00.000Z");
  });

  it("has nothing to show while no date is set", () => {
    expect(pickFair([{ fair_at: null, fair_name: "FECITI/MS" }], new Date())).toBeNull();
  });
});
