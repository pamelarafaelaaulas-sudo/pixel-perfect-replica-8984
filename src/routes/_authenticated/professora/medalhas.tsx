import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { medalPoolKey } from "@/lib/medals";
import { Award, Gift } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { teacherRosterQuery } from "@/lib/queries";
import { studentMedalRanking } from "@/lib/medals";
import { formatPoints } from "@/lib/penalty";
import { MedalCounts, MedalRules } from "@/components/medals";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/professora/medalhas")({
  head: () => ({
    meta: [
      { title: "Medalhas e ranking — FECITI Flow" },
      { name: "description", content: "Medalhas de ouro, prata, bronze e Honra ao Mérito por entregas no prazo, e o ranking do ano." },
      { property: "og:title", content: "Medalhas e ranking — FECITI Flow" },
      { property: "og:description", content: "Medalhas de ouro, prata, bronze e Honra ao Mérito por entregas no prazo, e o ranking do ano." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(teacherRosterQuery),
  component: MedalsPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="card-paper p-5 text-destructive">
      {error instanceof Error ? error.message : String(error)}
    </div>
  ),
  notFoundComponent: () => <div className="card-paper p-5">Página não encontrada.</div>,
});

function MedalsPage() {
  const { data: classes } = useSuspenseQuery(teacherRosterQuery);
  const [classId, setClassId] = useState<string>("all");
  const all = useMemo(
    () =>
      classes.map((c) => ({
        id: c.id,
        name: c.name,
        medal_pool: c.medal_pool,
        schedules: c.schedules ?? [],
        groups: (c.groups ?? []).map((g) => ({
          id: g.id,
          name: g.group_name,
          members: (g.group_members ?? []).map((m) => ({ id: m.student_id, name: m.profiles?.name ?? "Aluno" })),
          submissions: g.projects?.phase_submissions ?? [],
        })),
      })),
    [classes],
  );
  const rows = useMemo(() => studentMedalRanking(classId === "all" ? all : all.filter((c) => c.id === classId)), [all, classId]);
  const leaders = rows.filter((r) => r.position === 1 && r.tally.total > 0);

  return (
    <>
      <PageHeader
        eyebrow="Painel da professora"
        title="Medalhas e ranking"
        description="Cada aluno ganha as medalhas do seu grupo. No fim do ano, quem tiver mais pontos ganha o seu presente."
      />
      <div className="card-paper mb-6 space-y-3 p-5">
        <MedalRules />
        <div className="flex flex-wrap gap-2">
          {[{ id: "all", name: "Todas as turmas" }, ...all].map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setClassId(c.id)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                classId === c.id ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary",
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <MedalPools classes={classes.map((c) => ({ id: c.id, name: c.name, medal_pool: c.medal_pool }))} />

      {leaders.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-2 rounded-lg border border-highlight bg-highlight/20 p-4">
          <Gift className="size-5 text-foreground" />
          <span className="text-sm font-medium text-foreground">
            Na frente agora: {leaders.map((l) => l.name).join(", ")} ({formatPoints(leaders[0]!.tally.points)} pontos)
          </span>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState icon={<Award className="size-5" />} title="Nenhum aluno ainda" text="Quando os grupos entregarem etapas no prazo, as medalhas aparecem aqui." />
      ) : (
        <div className="card-paper overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Posição</th>
                <th className="px-4 py-3">Aluno</th>
                <th className="px-4 py-3">Turma · grupo</th>
                <th className="px-4 py-3">Medalhas</th>
                <th className="px-4 py-3 text-right">Pontos</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.classId}-${r.studentId}`} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-display text-lg font-semibold text-foreground">{r.tally.total > 0 ? `${r.position}º` : "—"}</td>
                  <td className="px-4 py-3 font-medium text-foreground">
                    <Link to="/professora/aluno/$studentId" params={{ studentId: r.studentId }} className="hover:text-primary">
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.className} · {r.groupName}
                  </td>
                  <td className="px-4 py-3">
                    <MedalCounts tally={r.tally} />
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-foreground">{formatPoints(r.tally.points)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/** Teacher picks which classes compete together: same label = one shared podium; empty = the class competes alone. */
function MedalPools({ classes }: { classes: { id: string; name: string; medal_pool: string | null }[] }) {
  const qc = useQueryClient();
  const [pools, setPools] = useState<Record<string, string>>(() => Object.fromEntries(classes.map((c) => [c.id, c.medal_pool ?? ""])));
  const dirty = classes.some((c) => (c.medal_pool ?? "") !== (pools[c.id] ?? "").trim());
  const save = useMutation({
    mutationFn: async () => {
      for (const c of classes) {
        const v = (pools[c.id] ?? "").trim();
        if ((c.medal_pool ?? "") === v) continue;
        const { error } = await supabase.from("classes").update({ medal_pool: v || null }).eq("id", c.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Disputas salvas");
      qc.invalidateQueries({ queryKey: ["teacher", "roster"] });
      qc.invalidateQueries({ queryKey: ["medals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const groups = new Map<string, string[]>();
  for (const c of classes) {
    const k = medalPoolKey({ id: c.id, medal_pool: pools[c.id] ?? null });
    groups.set(k, [...(groups.get(k) ?? []), c.name]);
  }
  const shared = [...groups.values()].filter((g) => g.length > 1);
  return (
    <div className="card-paper mb-6 space-y-4 p-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Quais turmas disputam entre si?</h2>
        <p className="text-sm text-muted-foreground">
          Dê o mesmo nome de disputa (ex.: "Manhã" ou "1º anos") às turmas que vão concorrer juntas pelo pódio de cada etapa. Turma sem nome
          disputa sozinha. Cada grupo continua sendo julgado pelo prazo da própria turma.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {classes.map((c) => (
          <div key={c.id} className="space-y-1">
            <Label htmlFor={`pool-${c.id}`}>{c.name}</Label>
            <Input
              id={`pool-${c.id}`}
              value={pools[c.id] ?? ""}
              maxLength={40}
              placeholder="Disputa sozinha"
              onChange={(e) => setPools((p) => ({ ...p, [c.id]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      {shared.length > 0 && (
        <p className="text-sm text-foreground">Disputam juntas: {shared.map((g) => g.join(" + ")).join(" · ")}</p>
      )}
      <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
        Salvar disputas
      </Button>
    </div>
  );
}
