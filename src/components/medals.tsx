import { useQuery } from "@tanstack/react-query";
import { Award } from "lucide-react";
import { cn } from "@/lib/utils";
import { classMedalsQuery } from "@/lib/queries";
import { MEDAL_EMOJI, MEDAL_KINDS, MEDAL_LABEL, MEDAL_POINTS, groupMedalRanking, stageMedals, type MedalKind, type MedalTally } from "@/lib/medals";
import { phaseMeta } from "@/lib/phases";
import { formatPoints } from "@/lib/penalty";

const MEDAL_STYLE: Record<MedalKind, string> = {
  ouro: "border-highlight bg-highlight/25",
  prata: "border-secondary/50 bg-secondary/15",
  bronze: "border-primary/40 bg-primary/10",
  honra: "border-border bg-muted",
};

export function MedalBadge({ kind, label, className }: { kind: MedalKind; label?: string; className?: string }) {
  return (
    <span
      title={MEDAL_LABEL[kind]}
      className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium text-foreground", MEDAL_STYLE[kind], className)}
    >
      <span aria-hidden>{MEDAL_EMOJI[kind]}</span>
      {label ?? MEDAL_LABEL[kind]}
    </span>
  );
}

/** "🥇 2 · 🥈 1 · …" compact counts. */
export function MedalCounts({ tally }: { tally: MedalTally }) {
  if (tally.total === 0) return <span className="text-sm text-muted-foreground">Nenhuma ainda</span>;
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {MEDAL_KINDS.filter((k) => tally[k] > 0).map((k) => (
        <MedalBadge key={k} kind={k} label={`${tally[k]}`} />
      ))}
    </span>
  );
}

export function MedalRules() {
  return (
    <p className="text-sm text-muted-foreground">
      Em cada etapa, os 3 primeiros grupos (da turma ou das turmas que disputam juntas) que entregam dentro do prazo ganham {MEDAL_EMOJI.ouro} ouro, {MEDAL_EMOJI.prata} prata e{" "}
      {MEDAL_EMOJI.bronze} bronze. Quem entrega no prazo depois deles ganha {MEDAL_EMOJI.honra} Honra ao Mérito. Pontos: ouro{" "}
      {MEDAL_POINTS.ouro}, prata {MEDAL_POINTS.prata}, bronze {MEDAL_POINTS.bronze}, Honra ao Mérito {formatPoints(MEDAL_POINTS.honra)}. Quem
      somar mais pontos no fim do ano ganha um presente da professora!
    </p>
  );
}

/** Student: the group's medals and its position in the class. */
export function StudentMedals({ classId, groupId, groupName }: { classId: string; groupId: string; groupName: string }) {
  const q = useQuery(classMedalsQuery(classId));
  if (!q.data) return null;
  const medals = stageMedals(q.data.schedules, q.data.deliveries);
  const groupIds = [...new Set([...q.data.deliveries.map((d) => d.group_id), groupId])];
  const ranking = groupMedalRanking(
    groupIds.map((id) => ({ id, name: id })),
    medals,
  );
  const mine = ranking.find((r) => r.id === groupId);
  if (!mine) return null;
  return (
    <aside className="card-paper h-fit space-y-3 p-6">
      <h2 className="flex items-center gap-2 text-xl font-semibold">
        <Award className="size-5 text-primary" /> Medalhas · {groupName}
      </h2>
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-display text-3xl font-semibold text-foreground">{formatPoints(mine.tally.points)}</span>
        <span className="text-sm text-muted-foreground">pontos</span>
        {mine.tally.total > 0 && (
          <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">{mine.position}º lugar na turma</span>
        )}
      </div>
      {mine.medals.length === 0 ? (
        <p className="text-sm text-muted-foreground">Entreguem a próxima etapa dentro do prazo para ganhar a primeira medalha!</p>
      ) : (
        <ul className="space-y-1.5">
          {mine.medals.map((m) => (
            <li key={m.phase} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-foreground">{phaseMeta(m.phase).name}</span>
              <MedalBadge kind={m.kind} />
            </li>
          ))}
        </ul>
      )}
      <MedalRules />
    </aside>
  );
}
