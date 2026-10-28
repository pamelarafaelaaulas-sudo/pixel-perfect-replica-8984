import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, Search, Users } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { teacherRosterQuery } from "@/lib/queries";
import { buildRoster, filterRoster } from "@/lib/roster";
import { PHASE_COUNT, phaseMeta } from "@/lib/phases";
import { formatPoints, type PhaseInfo } from "@/lib/penalty";
import { plural } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/professora/alunos")({
  head: () => ({
    meta: [
      { title: "Alunos — PamLab" },
      { name: "description", content: "Todos os alunos com turma, grupo, etapas entregues e atrasos." },
      { property: "og:title", content: "Alunos — PamLab" },
      { property: "og:description", content: "Todos os alunos com turma, grupo, etapas entregues e atrasos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(teacherRosterQuery),
  component: RosterPage,
});

const ALL = "all";

function RosterPage() {
  const { data: classes } = useSuspenseQuery(teacherRosterQuery);
  const [search, setSearch] = useState("");
  const [classId, setClassId] = useState<string>(ALL);
  const rows = useMemo(() => buildRoster(classes), [classes]);
  const visible = filterRoster(rows, search, classId === ALL ? null : classId);
  const lateCount = visible.filter((r) => r.penalty > 0).length;

  return (
    <>
      <Link to="/professora" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Minhas turmas
      </Link>
      <PageHeader
        eyebrow="Painel da professora"
        title="Alunos"
        description="Todos os alunos das suas turmas, com grupo, etapas entregues e atrasos. As entregas são do grupo, então os integrantes de um mesmo grupo têm os mesmos números."
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<Users className="size-5" />}
          title="Nenhum aluno ainda"
          text="Quando os alunos entrarem nas suas turmas com o código, eles aparecem aqui."
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative min-w-64 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar aluno, grupo ou e-mail"
                className="pl-9"
                aria-label="Buscar aluno"
              />
            </div>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger className="w-56" aria-label="Filtrar por turma">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas as turmas</SelectItem>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {plural(visible.length, "aluno", "alunos")} · {lateCount} com atraso
            </p>
          </div>

          <section className="card-paper overflow-x-auto p-0">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Aluno</th>
                  <th className="px-4 py-3 font-medium">Turma</th>
                  <th className="px-4 py-3 font-medium">Grupo</th>
                  <th className="px-4 py-3 font-medium">Etapas entregues</th>
                  <th className="px-4 py-3 text-right font-medium">Atraso</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      Nenhum aluno encontrado.
                    </td>
                  </tr>
                ) : (
                  visible.map((r) => (
                    <tr key={`${r.groupId}-${r.studentId}`} className="border-b border-border last:border-0 align-top">
                      <td className="px-4 py-3">
                        <Link
                          to="/professora/aluno/$studentId"
                          params={{ studentId: r.studentId }}
                          className="font-medium text-foreground hover:text-primary"
                        >
                          {r.name}
                        </Link>
                        {r.email && <p className="text-xs text-muted-foreground">{r.email}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to="/professora/turma/$classId"
                          params={{ classId: r.classId }}
                          className="hover:text-primary hover:underline"
                        >
                          {r.className}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to="/professora/grupo/$groupId"
                          params={{ groupId: r.groupId }}
                          className="hover:text-primary hover:underline"
                        >
                          {r.groupName}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <PhaseDots phases={r.phases} />
                        <p className="mt-1 text-xs text-muted-foreground">
                          {r.delivered} de {PHASE_COUNT} · {r.delivered < PHASE_COUNT ? `agora na etapa ${r.currentPhase}: ${phaseMeta(r.currentPhase).name}` : "projeto concluído"}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className="text-xs text-muted-foreground">{plural(r.daysLate, "dia", "dias")}</p>
                        <p className={cn("font-mono font-semibold", r.penalty > 0 ? "text-destructive" : "text-success")}>
                          {r.penalty > 0 ? `−${formatPoints(r.penalty)}` : "0,0"}
                        </p>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        </>
      )}
    </>
  );
}

function PhaseDots({ phases }: { phases: PhaseInfo[] }) {
  return (
    <div className="flex gap-1">
      {phases.map((p) => {
        const late = p.daysLate > 0;
        const tone =
          p.state === "delivered"
            ? late
              ? "bg-warning"
              : "bg-success"
            : p.state === "in_progress"
              ? late
                ? "bg-destructive"
                : "bg-primary"
              : "bg-muted";
        const label =
          p.state === "delivered"
            ? late
              ? `Etapa ${p.phase}: entregue com ${plural(p.daysLate, "dia", "dias")} de atraso`
              : `Etapa ${p.phase}: entregue no prazo`
            : p.state === "in_progress"
              ? late
                ? `Etapa ${p.phase}: atrasada (${plural(p.daysLate, "dia", "dias")})`
                : `Etapa ${p.phase}: em andamento`
              : `Etapa ${p.phase}: não entregue`;
        return <span key={p.phase} title={label} aria-label={label} className={cn("h-2 w-3.5 rounded-full", tone)} />;
      })}
    </div>
  );
}
