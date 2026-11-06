export type DatedDiaryEntry = { entry_date: string; content: string; kind: string };

/** Validate historical dates, not their age: saved entries are append-only. */
export function diaryDatesValid(entries: DatedDiaryEntry[], today: string): boolean {
  return entries.length > 0 && entries.every(({ entry_date }) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry_date)) return false;
    const parsed = new Date(`${entry_date}T12:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === entry_date && entry_date <= today;
  });
}

export function diaryAutoResult(datesValid: boolean, feedback: string | null) {
  return { status: datesValid ? "approved" as const : "changes_requested" as const, ai_status: feedback ? "complete" as const : "unavailable" as const, ai_feedback: feedback };
}