import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, School } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { teacherBimesterQuery } from "@/lib/queries";
import { bimesterReport, type BimesterClass } from "@/lib/bimester";
import { BIMESTERS, bimesterMeta } from "@/lib/phases";
import { formatPoints } from "@/lib/penalty";
import { plural } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/professora/bimestres")({
  head: () => ({
    meta: [
      { title: "Notas do bimestre — PamLab" },
      { name: "description", content: "Notas lançadas, desconto de atraso e total de cada grupo, nos 4 bimestres." },
      { property: "og:title", content: "Notas do bimestre — PamLab" },
      { property: "og:description", content: "Notas lançadas, desconto de atraso e total de cada grupo, nos 4 bimestres." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => {
    const b = Number(search["b"]);
    return { b: b === 2 || b === 3 || b === 4 ? b : 1 };
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(teacherBimesterQuery),
  component: BimesterPage,
});

function BimesterPage() {
  const { b } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data } = useSuspenseQuery(teacherBimesterQuery);
  const report = bimesterReport(data, b);

  return (
    <>
      <Link to="/professora" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Minhas turmas
      </Link>
      <PageHeader
        eyebrow="Painel da professora"
        title={`Notas do ${b}º bimestre · ${bimesterMeta(b).title}`}
        description={
          b === 4
            ? "Todas as turmas, com a nota da feira de cada grupo. A feira não tem desconto de atraso. Cada grupo de alunos vê só a própria linha."
            : "Todas as turmas, com a nota lançada, o desconto de atraso das etapas deste bimestre e o total de cada grupo. Cada grupo de alunos vê só a própria linha."
        }
      />

      <Tabs value={String(b)} onValueChange={(v) => navigate({ search: { b: Number(v) } })} className="mb-6">
        <TabsList className="h-auto flex-wrap">
          {BIMESTERS.map((n) => (
            <TabsTrigger key={n.number} value={String(n.number)}>
              {n.number}º bimestre · {n.title}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {report.length === 0 ? (
        <EmptyState icon={<School className="size-5" />} title="Nenhuma turma ainda" text="Crie uma turma para começar a lançar notas." />
      ) : (
        <div className="space-y-8">
          {report.map((c) => (
            <ClassTable key={c.classId} c={c} />
          ))}
        </div>
      )}
    </>
  );
}

function ClassTable({ c }: { c: BimesterClass }) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <Link to="/professora/turma/$classId" params={{ classId: c.classId }} className="text-2xl font-semibold hover:text-primary">
          {c.className}
        </Link>
        <p className="text-sm text-muted-foreground">
          {c.launched} de {plural(c.rows.length, "grupo", "grupos")} com nota lançada · desconto de {formatPoints(c.perDay)} por dia
        </p>
      </div>
      <div className="card-paper overflow-x-auto p-0">
        <table className="w-full min-w-[680px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-4 py-3 font-medium">Grupo</th>
              <th className="px-4 py-3 text-right font-medium">Nota lançada</th>
              <th className="px-4 py-3 text-right font-medium">Desconto de atraso</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {c.rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                  Nenhum grupo nesta turma ainda.
                </td>
              </tr>
            ) : (
              c.rows.map((r) => (
                <tr key={r.groupId} className="border-b border-border last:border-0 align-top">
                  <td className="px-4 py-3">
                    <Link to="/professora/grupo/$groupId" params={{ groupId: r.groupId }} className="font-medium text-foreground hover:text-primary">
                      {r.groupName}
                    </Link>
                    <p className="text-xs text-muted-foreground">{r.members.length ? r.members.join(", ") : "Sem integrantes"}</p>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {r.score === null ? (
                      <Badge variant="secondary">Não lançada</Badge>
                    ) : (
                      <>
                        {formatPoints(r.score)}
                        {r.reference && <span className="ml-1 text-xs text-muted-foreground">(referência)</span>}
                      </>
                    )}
                  </td>
                  <td className={cn("px-4 py-3 text-right font-mono", r.penalty > 0 ? "text-destructive" : "text-muted-foreground")}>
                    {r.penalty > 0 ? `−${formatPoints(r.penalty)}` : "0,0"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-base font-semibold">
                    {r.total === null ? <span className="text-muted-foreground">—</span> : formatPoints(r.total)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
