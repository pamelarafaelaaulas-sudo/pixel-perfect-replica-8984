import { PHASES } from "./phases";
import { daysLate } from "./penalty";

/**
 * Digital medals for meeting stage deadlines, per class:
 * the three highest-quality evaluated on-time groups get gold, silver and bronze;
 * every other group that delivers on time gets Honra ao Mérito. Late deliveries get nothing.
 * Every member of the group receives the group's medals.
 */
export type MedalKind = "ouro" | "prata" | "bronze" | "honra";

export const MEDAL_KINDS: MedalKind[] = ["ouro", "prata", "bronze", "honra"];
const PODIUM: MedalKind[] = ["ouro", "prata", "bronze"];

/** Year-end ranking points. */
export const MEDAL_POINTS: Record<MedalKind, number> = { ouro: 3, prata: 2, bronze: 1, honra: 0.5 };

export const MEDAL_LABEL: Record<MedalKind, string> = {
  ouro: "Ouro · 1º lugar",
  prata: "Prata · 2º lugar",
  bronze: "Bronze · 3º lugar",
  honra: "Honra ao Mérito",
};

export const MEDAL_EMOJI: Record<MedalKind, string> = { ouro: "🥇", prata: "🥈", bronze: "🥉", honra: "🎖️" };

/** `due_date` = the deadline of the group's own class (competing classes may have different dates). */
export type Delivery = { group_id: string; phase_number: number; submitted_at: string; due_date?: string | null; quality_score?: number | null };
export type Schedule = { phase_number: number; due_date: string };
export type StageMedal = { groupId: string; phase: number; kind: MedalKind; at: string };

/**
 * Medals of every stage among competing groups. Each delivery is judged by its own class deadline
 * (or `schedules` when it has none). Stages without a deadline give no medals.
 */
export function stageMedals(schedules: Schedule[], deliveries: Delivery[]): StageMedal[] {
  const out: StageMedal[] = [];
  for (const { number: phase } of PHASES) {
    const fallback = schedules.find((s) => s.phase_number === phase)?.due_date;
    const onTime = deliveries
      .filter((d) => {
        const due = d.due_date ?? fallback;
        return d.phase_number === phase && !!due && d.quality_score != null && Number.isFinite(d.quality_score) && daysLate(due, d.submitted_at) === 0;
      })
      .sort((a, b) => (b.quality_score ?? 0) - (a.quality_score ?? 0)
        || (new Date(b.due_date ?? fallback ?? "").getTime() - new Date(b.submitted_at).getTime())
          - (new Date(a.due_date ?? fallback ?? "").getTime() - new Date(a.submitted_at).getTime())
        || a.group_id.localeCompare(b.group_id));
    onTime.forEach((d, i) => out.push({ groupId: d.group_id, phase, kind: PODIUM[i] ?? "honra", at: d.submitted_at }));
  }
  return out;
}

export type MedalTally = Record<MedalKind, number> & { total: number; points: number };

export function tallyMedals(medals: { kind: MedalKind }[]): MedalTally {
  const t: MedalTally = { ouro: 0, prata: 0, bronze: 0, honra: 0, total: 0, points: 0 };
  for (const m of medals) {
    t[m.kind] += 1;
    t.total += 1;
    t.points += MEDAL_POINTS[m.kind];
  }
  t.points = Math.round(t.points * 100) / 100;
  return t;
}

function compareTally(a: MedalTally, b: MedalTally): number {
  return b.points - a.points || b.ouro - a.ouro || b.prata - a.prata || b.bronze - a.bronze || b.honra - a.honra;
}

/** Sorts by points (then gold, silver, bronze, honor); ties share the same position (1, 1, 3…). */
export function rankByMedals<T extends { tally: MedalTally }>(rows: T[], tieBreakName: (r: T) => string): (T & { position: number })[] {
  const sorted = [...rows].sort((a, b) => compareTally(a.tally, b.tally) || tieBreakName(a).localeCompare(tieBreakName(b), "pt-BR"));
  let position = 0;
  return sorted.map((r, i) => {
    const prev = sorted[i - 1];
    if (!prev || compareTally(prev.tally, r.tally) !== 0) position = i + 1;
    return { ...r, position };
  });
}

/** Ranking of the groups of one class. */
export function groupMedalRanking(groups: { id: string; name: string }[], medals: StageMedal[]) {
  return rankByMedals(
    groups.map((g) => ({ ...g, medals: medals.filter((m) => m.groupId === g.id), tally: tallyMedals(medals.filter((m) => m.groupId === g.id)) })),
    (r) => r.name,
  );
}

export type ScoreboardRow = { group_id: string; group_name: string; class_id: string; class_name: string; pool_key: string; phase_number: number | null; kind: string | null; submitted_at: string | null };

/** Public scoreboard rows contain medals, never AI scores or private feedback. */
export function scoreboardRankings(rows: ScoreboardRow[], classId?: string) {
  const medals: StageMedal[] = rows.flatMap((r) =>
    r.phase_number != null && MEDAL_KINDS.some((k) => k === r.kind)
      ? [{ groupId: r.group_id, phase: r.phase_number, kind: r.kind as MedalKind, at: r.submitted_at ?? "" }] : []);
  const groups = [...new Map(rows.map((r) => [r.group_id, { id: r.group_id, name: r.group_name, classId: r.class_id, className: r.class_name, poolKey: r.pool_key }])).values()];
  const rankedGroups = rankByMedals(groups.filter((g) => !classId || g.classId === classId).map((g) => ({ ...g, medals: medals.filter((m) => m.groupId === g.id), tally: tallyMedals(medals.filter((m) => m.groupId === g.id)) })), (g) => g.name);
  const classes = [...new Map(groups.map((g) => [g.classId, { id: g.classId, name: g.className, poolKey: g.poolKey }])).values()];
  const rankedClasses = classes.flatMap((c) => rankByMedals(classes.filter((x) => x.poolKey === c.poolKey).map((x) => ({ ...x, tally: tallyMedals(medals.filter((m) => groups.some((g) => g.id === m.groupId && g.classId === x.id))) })), (x) => x.name).filter((x) => x.id === c.id));
  return { medals, groups: rankedGroups, classes: rankedClasses };
}

/** Key of the competition a class is in: classes with the same pool label compete together; no label = alone. */
export const medalPoolKey = (c: { id: string; medal_pool?: string | null }) => {
  const p = c.medal_pool?.trim().toLowerCase();
  return p ? `pool:${p}` : `class:${c.id}`;
};

type RankClass = {
  id: string;
  name: string;
  medal_pool?: string | null;
  schedules: Schedule[];
  groups: { id: string; name: string; members: { id: string; name: string }[]; submissions: Omit<Delivery, "group_id" | "due_date">[] }[];
};

/** Medals for every group, with the podium computed inside each competition (pool of classes). */
export function poolMedals(classes: RankClass[]): StageMedal[] {
  const pools = new Map<string, RankClass[]>();
  for (const c of classes) pools.set(medalPoolKey(c), [...(pools.get(medalPoolKey(c)) ?? []), c]);
  return [...pools.values()].flatMap((cs) =>
    stageMedals(
      [],
      cs.flatMap((c) =>
        c.groups.flatMap((g) =>
          g.submissions.map((s) => ({
            ...s,
            group_id: g.id,
            due_date: c.schedules.find((x) => x.phase_number === s.phase_number)?.due_date ?? null,
          })),
        ),
      ),
    ),
  );
}

/** Ranking of students: each one gets all medals of their group. */
export function studentMedalRanking(classes: RankClass[]) {
  const medals = poolMedals(classes);
  const rows = classes.flatMap((c) => {
    return c.groups.flatMap((g) => {
      const mine = medals.filter((m) => m.groupId === g.id);
      return g.members.map((s) => ({
        studentId: s.id,
        name: s.name,
        groupId: g.id,
        groupName: g.name,
        classId: c.id,
        className: c.name,
        medals: mine,
        tally: tallyMedals(mine),
      }));
    });
  });
  return rankByMedals(rows, (r) => r.name);
}
