import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { FileDown, Printer } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { teacherIndicatorsQuery } from "@/lib/queries";
import { fairIndicators, indicatorsCsv, type IndicatorProject } from "@/lib/indicators";

export const Route = createFileRoute("/_authenticated/professora/indicadores")({
  head: () => ({
    meta: [
      { title: "Indicadores da feira — FECITI Flow" },
      { name: "description", content: "Métricas globais da feira: projetos por área e turma, ética, feiras externas e satisfação." },
      { property: "og:title", content: "Indicadores da feira — FECITI Flow" },
      { property: "og:description", content: "Métricas globais da feira para prestação de contas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(teacherIndicatorsQuery),
  errorComponent: ({ error }) => <div role="alert">{error.message}</div>,
  notFoundComponent: () => <div>Nada encontrado.</div>,
  component: IndicatorsPage,
});

function Bars({ title, data }: { title: string; data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <section className="card-paper break-inside-avoid p-5">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem dados ainda.</p>
      ) : (
        <ul className="space-y-2">
          {data.map((d) => (
            <li key={d.label} className="text-sm">
              <div className="flex justify-between"><span>{d.label}</span><b>{d.value}</b></div>
              <div className="mt-1 h-2 rounded-full bg-muted">
                <div className="h-2 rounded-full bg-primary" style={{ width: `${(d.value / max) * 100}%`, printColorAdjust: "exact" }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card-paper break-inside-avoid p-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-primary">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function IndicatorsPage() {
  const { data: classes } = useSuspenseQuery(teacherIndicatorsQuery);
  const projects: IndicatorProject[] = classes.flatMap((c) =>
    (c.groups ?? []).map((g) => {
      const p = Array.isArray(g.projects) ? g.projects[0] : g.projects;
      return {
        className: c.name,
        groupName: g.group_name,
        area: p?.area_code ?? null,
        members: g.group_members?.length ?? 0,
        currentPhase: p?.current_phase ?? 1,
        fairsInterest: p?.external_fairs_interest ?? false,
        fairs: p?.external_fairs ?? [],
        ethicsHuman: p?.ethics_human_research ?? null,
        ethicsCollection: p?.ethics_collection ?? [],
        ethicsFormUrl: p?.ethics_form_url ?? null,
        ethicsTemplate: c.ethics_form_template_url,
        peerScores: (g.peer_evaluations ?? []).map((e) => Number(e.score)),
      };
    }),
  );
  const r = fairIndicators(projects);
  const fairName = classes.find((c) => c.fair_name)?.fair_name ?? "FECITI";

  const downloadCsv = () => {
    const blob = new Blob([indicatorsCsv(projects)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `indicadores-feira-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  return (
    <>
      <PageHeader
        eyebrow="Painel da mentora"
        title={`Indicadores da ${fairName}`}
        description={`Relatório gerado em ${new Date().toLocaleDateString("pt-BR")} para prestação de contas com a direção escolar.`}
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button variant="outline" onClick={downloadCsv}><FileDown /> Baixar CSV</Button>
            <Button onClick={() => window.print()}><Printer /> Baixar PDF</Button>
          </div>
        }
      />
      <p className="mb-4 text-xs text-muted-foreground print:hidden">
        Para o PDF, escolha “Salvar como PDF” na janela de impressão.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Projetos inscritos" value={String(r.totalProjects)} />
        <Kpi label="Alunos participantes" value={String(r.totalStudents)} />
        <Kpi label="Conformidade ética" value={r.ethicsCompliance === null ? "—" : `${r.ethicsCompliance}%`} hint={`${r.ethicsPending} projeto(s) ainda sem triagem`} />
        <Kpi label="Satisfação média" value={r.satisfaction === null ? "—" : `${r.satisfaction.toFixed(1).replace(".", ",")} / 5`} hint={`${r.satisfactionCount} avaliação(ões) de colaboração`} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Bars title="Projetos por área" data={r.byArea} />
        <Bars title="Projetos por turma/série" data={r.byClass} />
        <Bars title="Adesão a feiras externas" data={r.fairs} />
      </div>
    </>
  );
}
