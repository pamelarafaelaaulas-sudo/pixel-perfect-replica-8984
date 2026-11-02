import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, ListChecks } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { teacherRosterQuery } from "@/lib/queries";
import { deadlineLabel, groupProgress, type CellStatus } from "@/lib/planning";
import { formatPoints } from "@/lib/penalty";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/professora/progresso")({
  head: () => ({
    meta: [
      { title: "Progresso dos grupos — PamLab" },
      { name: "description", content: "Cada grupo por etapa: o que falta entregar e o atraso de cada bimestre." },
      { property: "og:title", content: "Progresso dos grupos — PamLab" },
      { property: "og:description", content: "Cada grupo por etapa: o que falta entregar e o atraso de cada bimestre." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { turma?: string } =>
    typeof search["turma"] === "string" ? { turma: search["turma"] } : {},
  loader: ({ context }) => context.queryClient.ensureQueryData(teacherRosterQuery),
  component: ProgressPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="card-paper p-5 text-destructive">{error instanceof Error ? error.message : String(error)}</div>
  ),
  notFoundComponent: () => <div className="card-paper p-5">Página não encontrada.</div>,
});

const STATUS: Record<CellStatus, { label: string; cls: string }> = {
  late_open: { label: "Atrasada", cls: "border-destructive/40 bg-destructive/10 text-destructive" },
  in_progress: { label: "Em andamento", cls: "border-primary/40 bg-primary/10 text-primary" },
  upcoming: { label: "Próxima", cls: "border-border bg-muted text-muted-foreground" },
  on_time: { label: "Entregue", cls: "" },
  late_delivered: { label: "Entregue com atraso", cls: "" },
  skipped: { label: "Liberada", cls: "" },
};

function ProgressPage() {
  const { data: classes } = useSuspenseQuery(teacherRosterQuery);
  const { turma } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const cls = classes.find((c) => c.id === turma) ?? classes[0];
  const perDay = Number(cls?.late_penalty_per_day ?? 0);

  const groups = useMemo(
    () =>
      cls
        ? groupProgress({
            schedules: cls.schedules ?? [],
            perDay,
            groups: (cls.groups ?? []).map((g) => ({
              id: g.id,
              name: g.group_name,
              members: (g.group_members ?? []).map((m) => m.profiles?.name ?? "").filter(Boolean),
              currentPhase: g.projects?.current_phase ?? 1,
              submissions: g.projects?.phase_submissions ?? [],
              bannerReviews: g.projects?.banner_reviews ?? [],
            })),
          })
        : [],
    [cls, perDay],
  );
  const lateGroups = groups.filter((g) => g.lateOpen > 0).length;

  return (
    <>
      <Link to="/professora" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Minhas turmas
      </Link>
      <PageHeader
        eyebrow="Painel da professora"
        title="Progresso dos grupos"
        description="Cada grupo por etapa: o que ainda falta entregar e quanto o atraso já desconta em cada bimestre."
        actions={
          cls && (
            <div className="flex flex-wrap items-center gap-2">
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
              <Link
                to="/professora/turma/$classId/prazos"
                params={{ classId: cls.id }}
                className="text-sm font-medium text-primary hover:underline"
              >
                Prazos e desconto da turma
              </Link>
            </div>
          )
        }
      />

      {!cls ? (
        <EmptyState icon={<ListChecks className="size-5" />} title="Nenhuma turma ainda" text="Crie uma turma no painel para acompanhar os grupos aqui." />
      ) : groups.length === 0 ? (
        <EmptyState icon={<ListChecks className="size-5" />} title="Nenhum grupo nesta turma" text="Quando os alunos formarem grupos, o progresso aparece aqui." />
      ) : (
        <>
          <p className="mb-5 text-sm text-muted-foreground">
            {groups.length} grupo(s) · {lateGroups > 0 ? `${lateGroups} com etapa atrasada` : "nenhum com etapa atrasada"} · desconto de{" "}
            {formatPoints(perDay)} ponto por dia, só no bimestre da etapa atrasada.
          </p>
          <div className="grid gap-5 lg:grid-cols-2">
            {groups.map((g) => (
              <article key={g.id} className={cn("card-paper p-5", g.lateOpen > 0 && "border-l-4 border-l-destructive")}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link
                      to="/professora/grupo/$groupId"
                      params={{ groupId: g.id }}
                      className="font-display text-lg font-semibold hover:text-primary hover:underline"
                    >
                      {g.name}
                    </Link>
                    {g.members.length > 0 && <p className="text-xs text-muted-foreground">{g.members.join(", ")}</p>}
                  </div>
                  <Badge variant={g.totalPenalty > 0 ? "destructive" : "success"}>
                    {g.totalPenalty > 0 ? `−${formatPoints(g.totalPenalty)} de atraso` : "Sem atraso"}
                  </Badge>
                </div>

                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                    <span>Etapas entregues</span>
                    <span>
                      {g.delivered}/{g.total}
                    </span>
                  </div>
                  <Progress value={g.total ? (g.delivered / g.total) * 100 : 0} aria-label="Etapas entregues" />
                </div>

                <table className="mt-4 w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="py-1.5 font-medium">Bimestre</th>
                      <th className="py-1.5 text-center font-medium">Entregues</th>
                      <th className="py-1.5 text-center font-medium">Dias de atraso</th>
                      <th className="py-1.5 text-right font-medium">Desconto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.bimesters.map((b) => (
                      <tr key={b.bimester} className="border-b border-border/60 last:border-0">
                        <td className="py-1.5">
                          {b.bimester}º <span className="text-xs text-muted-foreground">· {b.title}</span>
                        </td>
                        <td className="py-1.5 text-center">
                          {b.delivered}/{b.total}
                        </td>
                        <td className={cn("py-1.5 text-center", b.daysLate > 0 && "font-medium text-destructive")}>{b.daysLate}</td>
                        <td className={cn("py-1.5 text-right font-mono", b.penalty > 0 && "text-destructive")}>
                          {b.penalty > 0 ? `−${formatPoints(b.penalty)}` : "0"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="mt-4">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">O que falta</p>
                  {g.missing.length === 0 ? (
                    <p className="flex items-center gap-2 text-sm text-success">
                      <CheckCircle2 className="size-4" /> Todas as etapas entregues.
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {g.missing.map((m) => (
                        <li key={m.phase} className={cn("flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm", STATUS[m.status].cls)}>
                          <span className="flex items-center gap-1.5">
                            {m.status === "late_open" && <AlertTriangle className="size-3.5" />}
                            <span className="font-mono text-xs opacity-70">{m.phase}.</span> {m.name}
                          </span>
                          <span className="text-xs">
                            {m.status === "late_open"
                              ? `${m.daysLate} dia(s) de atraso`
                              : m.dueDate
                                ? `${fmtDate(m.dueDate)} · ${deadlineLabel(m.dueDate)}`
                                : "sem prazo"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </>
  );
}
