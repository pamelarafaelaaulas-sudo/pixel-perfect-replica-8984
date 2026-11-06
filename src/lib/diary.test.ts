import { describe, expect, it } from "vitest";
import { diaryReviewWindow, diaryStats, diaryVideoProblems, isDiaryReviewOpen, videoEmbedUrl, diarySubmissionProblems } from "./diary";
import { phaseProblems } from "./phase-rules";

describe("group diary approval submission", () => {
  it("requires both a chosen leader and diary responsible student", () => {
    expect(diarySubmissionProblems({ leaderId: "a", diaryId: null, entryCount: 1, pending: false })).toHaveLength(1);
    expect(diarySubmissionProblems({ leaderId: null, diaryId: "b", entryCount: 1, pending: false })).toHaveLength(1);
    expect(diarySubmissionProblems({ leaderId: "a", diaryId: "b", entryCount: 1, pending: false })).toEqual([]);
  });
  it("requires at least one diary record", () => {
    expect(diarySubmissionProblems({ leaderId: "a", diaryId: "b", entryCount: 0, pending: false })).toHaveLength(1);
  });
  it("blocks another submission while approval is pending", () => {
    expect(diarySubmissionProblems({ leaderId: "a", diaryId: "b", entryCount: 2, pending: true })).toHaveLength(1);
  });
});

describe("Diário de Bordo video (stage 1)", () => {
  it("blocks the Tema until the group confirms it watched the teacher's video", () => {
    expect(diaryVideoProblems({ diary_video_url: "https://youtu.be/abc123", diary_video_watched_at: null })).toHaveLength(1);
    expect(diaryVideoProblems({ diary_video_url: "https://youtu.be/abc123", diary_video_watched_at: "2026-11-02T10:00:00Z" })).toEqual([]);
    expect(phaseProblems(1, { theme: "Água", diary_video_url: "https://youtu.be/abc123" }, 0)).toHaveLength(1);
  });
  it("does not block while the teacher has not set the video", () => {
    expect(phaseProblems(1, { theme: "Água" }, 0)).toEqual([]);
  });
  it("embeds YouTube, Vimeo and Drive links", () => {
    expect(videoEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(videoEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(videoEmbedUrl("https://vimeo.com/12345")).toBe("https://player.vimeo.com/video/12345");
    expect(videoEmbedUrl("https://drive.google.com/file/d/AbC/view")).toBe("https://drive.google.com/file/d/AbC/preview");
    expect(videoEmbedUrl("https://exemplo.com/video")).toBeNull();
  });
});

describe("diary evaluation only in the 3rd bimestre", () => {
  const schedules = [
    { phase_number: 12, due_date: "2026-08-01T03:59:00Z" },
    { phase_number: 13, due_date: "2026-10-01T03:59:00Z" },
  ];
  it("defaults to Resumo deadline → Banner deadline", () => {
    const w = diaryReviewWindow({ schedules });
    expect(w).toEqual({ start: schedules[0]!.due_date, end: schedules[1]!.due_date, custom: false });
    expect(isDiaryReviewOpen(w, new Date("2026-07-15T12:00:00Z"))).toBe(false);
    expect(isDiaryReviewOpen(w, new Date("2026-09-01T12:00:00Z"))).toBe(true);
    expect(isDiaryReviewOpen(w, new Date("2026-10-05T12:00:00Z"))).toBe(false);
  });
  it("uses the teacher's own dates when set", () => {
    const w = diaryReviewWindow({ schedules, diary_review_start: "2026-10-01T04:00:00Z", diary_review_end: "2026-12-01T03:59:00Z" });
    expect(w.custom).toBe(true);
    expect(isDiaryReviewOpen(w, new Date("2026-11-02T12:00:00Z"))).toBe(true);
  });
});

describe("diary history numbers", () => {
  it("counts entries, frequency and the last entry", () => {
    const s = diaryStats(
      [
        { entry_date: "2026-10-01" },
        { entry_date: "2026-10-01" },
        { entry_date: "2026-10-08" },
        { entry_date: "2026-10-15" },
        { entry_date: "2026-10-22" },
      ],
      "2026-10-24",
    );
    expect(s.total).toBe(5);
    expect(s.lastDate).toBe("2026-10-22");
    expect(s.activeWeeks).toBe(4);
    expect(s.weeks).toBe(4);
    expect(s.avgGapDays).toBe(7);
    expect(s.daysSinceLast).toBe(2);
    expect(s.frequency).toBe("regular");
  });
  it("marks a diary with no entry for over 14 days as stopped", () => {
    expect(diaryStats([{ entry_date: "2026-10-01" }], "2026-10-20").frequency).toBe("parado");
    expect(diaryStats([], "2026-10-20").frequency).toBe("sem_registros");
  });
});
