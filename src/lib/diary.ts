/**
 * Bloco 3: video trail and Diário de Bordo. Pure rules shared by student and teacher screens.
 * The database (phase_rule_problem, stage 1) enforces the same video rule.
 */

export const DIARY_KINDS = [
  { key: "registro", label: "Registro" },
  { key: "acerto", label: "Acerto" },
  { key: "erro", label: "Erro" },
  { key: "mudanca", label: "Mudança de rota" },
] as const;
export type DiaryKind = (typeof DIARY_KINDS)[number]["key"];
export const diaryKindLabel = (k: string) => DIARY_KINDS.find((x) => x.key === k)?.label ?? "Registro";

/** Diary entries may be dated up to this many days back (continuous records). Mirrored by SQL guard_diary_entry. */
export const DIARY_MAX_BACKDATE_DAYS = 7;

export function diarySubmissionProblems(v: { leaderId?: string | null; diaryId?: string | null; entryCount: number; pending: boolean }): string[] {
  const problems: string[] = [];
  if (!v.leaderId || !v.diaryId) problems.push("Escolham o líder e o responsável pelo diário antes de enviar.");
  if (v.entryCount < 1) problems.push("Salvem pelo menos um registro no diário antes de enviar.");
  if (v.pending) problems.push("O diário já está aguardando aprovação.");
  return problems;
}

/** The highlight pattern taught in the references video. */
export const HIGHLIGHT_COLORS = [
  { color: "Amarelo", token: "highlight", meaning: "Problema de pesquisa e objetivos" },
  { color: "Verde", token: "success", meaning: "Metodologia e materiais" },
  { color: "Azul", token: "info", meaning: "Resultados e conclusões" },
] as const;

/** Built-in pre-highlighted model article, used when the teacher did not set her own. */
export const DEFAULT_HIGHLIGHTED_ARTICLE = "/modelo-artigo-grifado.pdf";

/** Embeddable URL for YouTube / Vimeo / Google Drive links; null when the link can only be opened. */
export function videoEmbedUrl(url: string | null | undefined): string | null {
  const u = (url ?? "").trim();
  if (!/^https:\/\//i.test(u)) return null;
  const yt =
    u.match(/youtube\.com\/watch\?(?:.*&)?v=([\w-]{6,})/i) ??
    u.match(/youtu\.be\/([\w-]{6,})/i) ??
    u.match(/youtube\.com\/(?:shorts|embed|live)\/([\w-]{6,})/i);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const vimeo = u.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  const drive = u.match(/drive\.google\.com\/file\/d\/([\w-]+)/i);
  if (drive) return `https://drive.google.com/file/d/${drive[1]}/preview`;
  return null;
}

export function isVideoLink(url: string | null | undefined): boolean {
  return /^https:\/\/\S+$/i.test((url ?? "").trim());
}

/** Stage 1 is blocked until the group confirms it watched the Diário de Bordo video (only when the teacher set one). */
export function diaryVideoProblems(v: { diary_video_url?: string | null; diary_video_watched_at?: string | null }): string[] {
  if (!v.diary_video_url?.trim() || v.diary_video_watched_at) return [];
  return ["Assistam ao vídeo do Diário de Bordo e marquem que assistiram antes de entregar."];
}

/**
 * When the teacher may grade the diaries (3rd bimestre). Uses the dates she set; otherwise it runs from the
 * Resumo deadline (end of the 2nd bimestre) to the Banner deadline (end of the 3rd).
 */
export function diaryReviewWindow(c: {
  diary_review_start?: string | null;
  diary_review_end?: string | null;
  schedules?: { phase_number: number; due_date: string }[] | null;
}): { start: string | null; end: string | null; custom: boolean } {
  if (c.diary_review_start && c.diary_review_end) return { start: c.diary_review_start, end: c.diary_review_end, custom: true };
  const due = (n: number) => c.schedules?.find((s) => s.phase_number === n)?.due_date ?? null;
  return { start: c.diary_review_start ?? due(12), end: c.diary_review_end ?? due(13), custom: false };
}

export function isDiaryReviewOpen(w: { start: string | null; end: string | null }, now: Date = new Date()): boolean {
  if (!w.start || !w.end) return false;
  const t = now.getTime();
  return t >= new Date(w.start).getTime() && t <= new Date(w.end).getTime();
}

export type DiaryStats = {
  total: number;
  firstDate: string | null;
  lastDate: string | null;
  /** Distinct days with at least one entry. */
  activeDays: number;
  /** Weeks (7-day blocks from the first entry until today) with at least one entry, out of all weeks. */
  activeWeeks: number;
  weeks: number;
  /** Average days between consecutive entry days; null with fewer than 2 days. */
  avgGapDays: number | null;
  daysSinceLast: number | null;
  frequency: "sem_registros" | "regular" | "irregular" | "parado";
};

export const FREQUENCY_LABEL: Record<DiaryStats["frequency"], string> = {
  sem_registros: "Sem registros",
  regular: "Regular",
  irregular: "Irregular",
  parado: "Parado",
};

const DAY = 24 * 60 * 60 * 1000;
const dayNumber = (d: string) => Math.floor(Date.parse(`${d.slice(0, 10)}T12:00:00Z`) / DAY);

/** Total entries, frequency of updates and last entry for one student's diary. `today` is yyyy-MM-dd. */
export function diaryStats(entries: { entry_date: string }[], today: string): DiaryStats {
  const days = [...new Set(entries.map((e) => e.entry_date.slice(0, 10)))].sort();
  if (days.length === 0)
    return {
      total: 0,
      firstDate: null,
      lastDate: null,
      activeDays: 0,
      activeWeeks: 0,
      weeks: 0,
      avgGapDays: null,
      daysSinceLast: null,
      frequency: "sem_registros",
    };
  const nums = days.map(dayNumber);
  const first = nums[0]!;
  const last = nums.at(-1)!;
  const now = Math.max(dayNumber(today), last);
  const weeks = Math.floor((now - first) / 7) + 1;
  const activeWeeks = new Set(nums.map((n) => Math.floor((n - first) / 7))).size;
  const gaps = nums.slice(1).map((n, i) => n - nums[i]!);
  const avgGapDays = gaps.length ? Math.round((gaps.reduce((s, g) => s + g, 0) / gaps.length) * 10) / 10 : null;
  const daysSinceLast = now - last;
  const frequency = daysSinceLast > 14 ? "parado" : activeWeeks / weeks >= 0.75 ? "regular" : "irregular";
  return {
    total: entries.length,
    firstDate: days[0]!,
    lastDate: days.at(-1)!,
    activeDays: days.length,
    activeWeeks,
    weeks,
    avgGapDays,
    daysSinceLast,
    frequency,
  };
}

/** Today in Mato Grosso do Sul as yyyy-MM-dd (the diary's calendar). */
export function diaryToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Campo_Grande" }).format(now);
}
