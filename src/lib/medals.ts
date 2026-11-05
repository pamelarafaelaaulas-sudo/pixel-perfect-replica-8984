import { PHASES } from "./phases";
import { daysLate } from "./penalty";

/**
 * Digital medals for meeting stage deadlines, per class:
 * the 1st, 2nd and 3rd groups to deliver a stage on time get gold, silver and bronze;
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

export type Delivery = { group_id: string; phase_number: number; submitted_at: string };
export type Schedule = { phase_number: number; due_date: string };
export type StageMedal = { groupId: string; phase: number; kind: MedalKind; at: string };

/** Medals of every stage of one class. Stages without a deadline give no medals. */
export function stageMedals(schedules: Schedule[], deliveries: Delivery[]): StageMedal[] {
  const out: StageMedal[] = [];
  for (const { number: phase } of PHASES) {
    const due = schedules.find((s) => s.phase_number === phase)?.due_date;
    if (!due) continue;
    const onTime = deliveries
      .filter((d) => d.phase_number === phase && daysLate(due, d.submitted_at) === 0)
      .sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime() || a.group_id.localeCompare(b.group_id));
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

/** Ranking of students: each one gets all medals of their group. */
export function studentMedalRanking(
  classes: {
    id: string;
    name: string;
    schedules: Schedule[];
    groups: { id: string; name: string; members: { id: string; name: string }[]; submissions: Omit<Delivery, "group_id">[] }[];
  }[],
) {
  const rows = classes.flatMap((c) => {
    const medals = stageMedals(
      c.schedules,
      c.groups.flatMap((g) => g.submissions.map((s) => ({ ...s, group_id: g.id }))),
    );
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
