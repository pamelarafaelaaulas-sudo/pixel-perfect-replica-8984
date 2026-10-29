import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ArrowLeft, CalendarRange } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { teacherRosterQuery } from "@/lib/queries";
import { cellStatus, deadlineLabel, planningOverview, type CellStatus } from "@/lib/planning";
import { PHASE_COUNT } from "@/lib/phases";
import { fmtDate, fmtDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/professora/planejamento")({
  head: () => ({
    meta: [
      { title: "Planejamento — PamLab" },
      { name: "description", content: "Todas as etapas do projeto com prazos e o progresso de cada grupo." },
      { property: "og:title", content: "Planejamento — PamLab" },
      { property: "og:description", content: "Todas as etapas do projeto com prazos e o progresso de cada grupo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { turma?: string } =>
    typeof search["turma"] === "string" ? { turma: search["turma"] } : {},
  loader: ({ context }) => context.queryClient.ensureQueryData(teacherRosterQuery),
  component: PlanningPage,
});

const CELL: Record<CellStatus, { cls: string; label: string }> = {
  on_time: { cls: "bg-success text-success-foreground", label: "Entregue no prazo" },
  late_delivered: { cls: "bg-warning text-warning-foreground", label: "Entregue com atraso" },
  late_open: { cls: "bg-destructive text-destructive-foreground", label: "Atrasada, não entregue" },
  in_progress: { cls: "border-2 border-primary bg-primary/10 text-primary", label: "Em andamento" },
  upcoming: { cls: "bg-muted text-muted-foreground", label: "Ainda não começou" },
  skipped: { cls: "bg-muted text-muted-foreground opacity-50", label: "Liberada pela professora" },
};

function PlanningPage() {
  const { data: classes } = useSuspenseQuery(teacherRosterQuery);
  const { turma } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const cls = classes.find((c) => c.id === turma) ?? classes[0];

  const overview = useMemo(
    () =>
      cls
        ? planningOverview({
            schedules: cls.schedules ?? [],
            groups: (cls.groups ?? []).map((g) => ({
              id: g.id,
              name: g.group_name,
              currentPhase: g.projects?.current_phase ?? 1,
              submissions: g.projects?.phase_submissions ?? [],
            })),
          })
        : null,
    [cls],
  );

  return (
    <>
      <Link to="/professora" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Minhas turmas
      </Link>
      <PageHeader
        eyebrow="Painel da professora"
        title="Planejamento"
        description="Todas as etapas do projeto, na ordem, com o prazo de cada uma e o andamento dos grupos da turma."
        actions={
          cls && (
            <Select value={cls.id} onValueChange={(v) => navigate({ search: { turma: v } })}>
              <SelectTrigger className="w-56" aria-label="Escolher turma">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        }
      />

      {!cls || !overview ? (
        <EmptyState
          icon={<CalendarRange className="size-5" />}
          title="Nenhuma turma ainda"
          text="Crie uma turma no painel para ver as etapas e os prazos aqui."
        />
      ) : (
        <div className="space-y-8">
          <section className="card-paper overflow-x-auto p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <h2 className="font-display text-xl font-semibold">Etapas e prazos</h2>
              <Link
                to="/professora/turma/$classId/prazos"
                params={{ classId: cls.id }}
                className="text-sm font-medium text-primary hover:underline"
              >
                Ajustar prazos e descontos
              </Link>
            </div>
            <table className="w-full min-w-[680px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Etapa</th>
                  <th className="px-4 py-2 font-medium">Bimestre</th>
                  <th className="px-4 py-2 font-medium">Prazo</th>
                  <th className="px-4 py-2 font-medium">Entregues</th>
                  <th className="px-4 py-2 font-medium">Com atraso</th>
                </tr>
              </thead>
              <tbody>
                {overview.stages.map((s) => {
                  const passed = s.dueDate ? new Date(s.dueDate).getTime() < Date.now() : false;
                  return (
                    <tr key={s.phase} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2">
                        <span className="mr-2 font-mono text-xs text-muted-foreground">{s.phase}</span>
                        <span className="font-medium">{s.name}</span>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{s.bimester}º</td>
                      <td className="px-4 py-2">
                        <span>{fmtDate(s.dueDate)}</span>
                        <span className={cn("ml-2 text-xs", passed ? "text-muted-foreground" : "text-primary")}>
                          {deadlineLabel(s.dueDate)}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        {s.delivered}/{s.groups}
                      </td>
                      <td className={cn("px-4 py-2", s.late > 0 && "font-medium text-destructive")}>{s.late}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section className="card-paper overflow-x-auto p-0">
            <div className="border-b border-border px-4 py-3">
              <h2 className="font-display text-xl font-semibold">Progresso dos grupos</h2>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                {(["on_time", "late_delivered", "late_open", "in_progress", "upcoming"] as const).map((k) => (
                  <span key={k} className="inline-flex items-center gap-1.5">
                    <span className={cn("inline-block size-3 rounded", CELL[k].cls)} /> {CELL[k].label}
                  </span>
                ))}
              </div>
            </div>
            {overview.groups.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhum grupo nesta turma ainda.</p>
            ) : (
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="px-4 py-2 text-left font-medium">Grupo</th>
                    {overview.stages.map((s) => (
                      <th key={s.phase} className="px-1 py-2 text-center font-mono text-xs font-medium" title={s.name}>
                        {s.phase}
                      </th>
                    ))}
                    <th className="px-4 py-2 text-right font-medium">Entregues</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.groups.map((g) => (
                    <tr key={g.id} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2">
                        <Link to="/professora/grupo/$groupId" params={{ groupId: g.id }} className="font-medium hover:text-primary hover:underline">
                          {g.name}
                        </Link>
                      </td>
                      {g.phases.map((p) => {
                        const st = cellStatus(p);
                        const stage = overview.stages[p.phase - 1]!;
                        const detail = p.submittedAt ? `entregue ${fmtDateTime(p.submittedAt)}` : CELL[st].label.toLowerCase();
                        return (
                          <td key={p.phase} className="px-1 py-2 text-center">
                            <span
                              className={cn("inline-flex size-6 items-center justify-center rounded text-[10px] font-semibold", CELL[st].cls)}
                              title={`${stage.name}: ${detail}${p.daysLate > 0 ? ` · ${p.daysLate} dia(s) de atraso` : ""}`}
                              aria-label={`${stage.name}: ${CELL[st].label}`}
                            >
                              {p.daysLate > 0 ? p.daysLate : ""}
                            </span>
                          </td>
                        );
                      })}
                      <td className="px-4 py-2 text-right">
                        {g.delivered}/{PHASE_COUNT}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
              O número dentro do quadrado é a quantidade de dias de atraso. Passe o mouse para ver a etapa e a data de entrega.
            </p>
          </section>
        </div>
      )}
    </>
  );
}
