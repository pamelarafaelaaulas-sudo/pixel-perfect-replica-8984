import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Check, Clock, Lock, SkipForward, Users } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { classDetailQuery } from "@/lib/queries";
import { PHASES } from "@/lib/phases";
import { fmtDate, fmtDateTime, plural } from "@/lib/format";
import { classLateness, formatPoints, type PhaseInfo } from "@/lib/penalty";

export const Route = createFileRoute("/_authenticated/professora/turma/$classId_/prazos")({
  head: () => ({
    meta: [
      { title: "Prazos e atrasos — Caderno de Projetos" },
      { name: "description", content: "Quando cada grupo entregou cada etapa e quanto perdeu por atraso." },
      { property: "og:title", content: "Prazos e atrasos — Caderno de Projetos" },
      { property: "og:description", content: "Quando cada grupo entregou cada etapa e quanto perdeu por atraso." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(classDetailQuery(params.classId));
    if (!data) throw notFound();
  },
  component: DeadlinesPage,
});

function DeadlinesPage() {
  const { classId } = Route.useParams();
  const { data: cls } = useSuspenseQuery(classDetailQuery(classId));
  if (!cls) return null;

  const perDay = Number(cls.late_penalty_per_day);
  const schedules = [...(cls.schedules ?? [])].sort((a, b) => a.phase_number - b.phase_number);
  const summary = classLateness({
    perDay,
    schedules,
    groups: (cls.groups ?? []).map((g) => ({
      id: g.id,
      name: g.group_name,
      members: (g.group_members ?? []).map((m) => m.profiles?.name ?? "").filter(Boolean),
      currentPhase: g.projects?.current_phase ?? 1,
      submissions: g.projects?.phase_submissions ?? [],
    })),
  });

  return (
    <>
      <Link
        to="/professora/turma/$classId"
        params={{ classId }}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {cls.name}
      </Link>
      <PageHeader
        eyebrow="Prazos e atrasos"
        title={cls.name}
        description={`Cada dia de atraso desconta ${formatPoints(perDay)} ponto(s) da nota. Etapas ainda abertas continuam somando dias depois do prazo.`}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Desconto por dia" value={formatPoints(perDay)} />
        <Stat label="Grupos com atraso" value={`${summary.lateGroups} de ${summary.rows.length}`} />
        <Stat label="Total descontado na turma" value={summary.totalPenalty > 0 ? `−${formatPoints(summary.totalPenalty)}` : "0,0"} warn={summary.totalPenalty > 0} />
      </div>

      {summary.rows.length === 0 ? (
        <EmptyState
          icon={<Users className="size-5" />}
          title="Nenhum grupo ainda"
          text={`Quando os alunos entrarem com o código ${cls.class_code}, as entregas aparecem aqui.`}
        />
      ) : (
        <section className="card-paper overflow-x-auto p-0">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 font-medium text-muted-foreground">Grupo</th>
                {PHASES.map((p) => {
                  const due = schedules.find((s) => s.phase_number === p.number)?.due_date;
                  return (
                    <th key={p.number} className="px-3 py-3 align-bottom">
                      <span className="block font-mono text-xs text-muted-foreground">ETAPA {p.number}</span>
                      <span className="block font-medium text-foreground">{p.name}</span>
                      <span className="block text-xs font-normal text-muted-foreground">Prazo {fmtDate(due)}</span>
                    </th>
                  );
                })}
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Dias / total</th>
              </tr>
            </thead>
            <tbody>
              {summary.rows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0 align-top">
                  <td className="px-4 py-4">
                    <Link
                      to="/professora/grupo/$groupId"
                      params={{ groupId: row.id }}
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {row.name}
                    </Link>
                    <p className="max-w-48 text-xs text-muted-foreground">{row.members.join(", ") || "Sem integrantes"}</p>
                  </td>
                  {row.phases.map((p) => (
                    <td key={p.phase} className="px-3 py-4">
                      <PhaseCell p={p} />
                    </td>
                  ))}
                  <td className="px-4 py-4 text-right">
                    <p className="text-xs text-muted-foreground">{plural(row.totalDays, "dia", "dias")}</p>
                    <p
                      className={cn(
                        "font-mono text-base font-semibold",
                        row.totalPenalty > 0 ? "text-destructive" : "text-success",
                      )}
                    >
                      {row.totalPenalty > 0 ? `−${formatPoints(row.totalPenalty)}` : "0,0"}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="card-paper p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-mono text-2xl font-semibold", warn ? "text-destructive" : "text-foreground")}>{value}</p>
    </div>
  );
}

function PhaseCell({ p }: { p: PhaseInfo }) {
  const late = p.daysLate > 0;
  if (p.state === "delivered") {
    return (
      <div className="space-y-1">
        <Badge variant={late ? "warning" : "success"} className="gap-1">
          {late ? <AlertTriangle className="size-3" /> : <Check className="size-3" />}
          {late ? "Entregue com atraso" : "No prazo"}
        </Badge>
        <p className="text-xs text-foreground">{fmtDateTime(p.submittedAt)}</p>
        {late && (
          <p className="text-xs font-medium text-destructive">
            {plural(p.daysLate, "dia", "dias")} · −{formatPoints(p.penalty)}
          </p>
        )}
      </div>
    );
  }
  if (p.state === "in_progress") {
    return (
      <div className="space-y-1">
        <Badge variant={late ? "destructive" : "secondary"} className="gap-1">
          {late ? <AlertTriangle className="size-3" /> : <Clock className="size-3" />}
          {late ? "Atrasada" : "Em andamento"}
        </Badge>
        {late ? (
          <p className="text-xs font-medium text-destructive">
            {plural(p.daysLate, "dia", "dias")} até agora · −{formatPoints(p.penalty)}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Ainda não entregue</p>
        )}
      </div>
    );
  }
  if (p.state === "skipped") {
    return (
      <Badge variant="muted" className="gap-1">
        <SkipForward className="size-3" /> Liberada
      </Badge>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Lock className="size-3" /> Não liberada
    </span>
  );
}
