import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, Download, EyeOff, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { teacherExportQuery } from "@/lib/queries";
import { buildExport } from "@/lib/export-rows";
import { buildWorkbook, downloadBlob } from "@/lib/export-xlsx";
import { BIMESTERS } from "@/lib/phases";
import { formatPoints } from "@/lib/penalty";

export const Route = createFileRoute("/_authenticated/professora/exportar")({
  head: () => ({
    meta: [
      { title: "Exportar notas — Caderno de Projetos" },
      { name: "description", content: "Baixe em planilha as notas, descontos de atraso e feedbacks de cada grupo." },
      { property: "og:title", content: "Exportar notas — Caderno de Projetos" },
      { property: "og:description", content: "Planilha com notas e feedbacks das turmas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(teacherExportQuery),
  component: ExportPage,
});

const ALL = "todas";

function slug(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function ExportPage() {
  const { data } = useSuspenseQuery(teacherExportQuery);
  const [classId, setClassId] = useState(ALL);
  const [bim, setBim] = useState(ALL);
  const [file, setFile] = useState<{ blob: Blob; name: string } | null>(null);
  const [building, setBuilding] = useState(false);

  const filters = { classId: classId === ALL ? undefined : classId, bimester: bim === ALL ? undefined : Number(bim) };
  const rows = useMemo(() => buildExport(data, filters), [data, classId, bim]); // eslint-disable-line react-hooks/exhaustive-deps
  const className = data.classes.find((c) => c.id === classId)?.name;
  const launched = rows.grades.filter((r) => r.score !== null).length;

  function reset<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
      setFile(null);
    };
  }

  async function prepare() {
    setBuilding(true);
    try {
      const title = `Notas e feedbacks${className ? ` — ${className}` : ""}`;
      const blob = await buildWorkbook(rows, title);
      const date = new Date().toISOString().slice(0, 10);
      const name = `notas-feedbacks${className ? `-${slug(className)}` : ""}${bim !== ALL ? `-${bim}bim` : ""}-${date}.xlsx`;
      setFile({ blob, name });
    } catch (e) {
      toast.error(`Não foi possível gerar a planilha: ${(e as Error).message}`);
    } finally {
      setBuilding(false);
    }
  }

  return (
    <>
      <Link to="/professora" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Painel
      </Link>
      <PageHeader
        eyebrow="Painel da professora"
        title="Exportar notas e feedbacks"
        description="Baixe uma planilha do Excel com as notas lançadas, o desconto de atraso e o total de cada grupo, os seus comentários, a avaliação da IA e a avaliação entre colegas."
      />

      <section className="card-paper mb-6 grid gap-5 p-6 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label>Turma</Label>
          <Select value={classId} onValueChange={reset(setClassId)}>
            <SelectTrigger aria-label="Turma">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as turmas</SelectItem>
              {data.classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Bimestre</Label>
          <Select value={bim} onValueChange={reset(setBim)}>
            <SelectTrigger aria-label="Bimestre">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os bimestres</SelectItem>
              {BIMESTERS.map((b) => (
                <SelectItem key={b.number} value={String(b.number)}>
                  {b.number}º bimestre · {b.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {file ? (
          <Button size="lg" onClick={() => downloadBlob(file.blob, file.name)}>
            <Download /> Baixar planilha
          </Button>
        ) : (
          <Button size="lg" onClick={prepare} disabled={building || rows.grades.length === 0}>
            {building ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />} Gerar planilha
          </Button>
        )}
      </section>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Notas" value={`${launched} lançada(s)`} hint={`${rows.grades.length} linha(s) de grupo × bimestre`} />
        <Stat label="Avaliação da IA" value={`${rows.ai.length} etapa(s)`} hint="A avaliação mais recente de cada etapa" />
        <Stat label="Avaliação entre colegas" value={`${rows.peers.length} resposta(s)`} hint="Nota de 1 a 5 e comentário" />
      </div>

      <p className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground">
        <EyeOff className="size-4" /> A planilha traz os comentários confidenciais entre colegas e a nota da IA: guarde-a só com você.
      </p>

      <section className="card-paper overflow-x-auto">
        <h2 className="px-4 pt-4 text-lg font-semibold">Prévia da aba “Notas”</h2>
        {rows.grades.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Nenhum grupo nesta seleção.</p>
        ) : (
          <table className="mt-2 w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-4 py-2 font-medium">Turma</th>
                <th className="px-4 py-2 font-medium">Grupo</th>
                <th className="px-4 py-2 font-medium">Bimestre</th>
                <th className="px-4 py-2 text-right font-medium">Nota</th>
                <th className="px-4 py-2 text-right font-medium">Desconto</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
                <th className="px-4 py-2 font-medium">Comentário</th>
              </tr>
            </thead>
            <tbody>
              {rows.grades.slice(0, 40).map((r, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">{r.className}</td>
                  <td className="px-4 py-2">{r.groupName}</td>
                  <td className="px-4 py-2 text-muted-foreground">{r.bimester}</td>
                  <td className="px-4 py-2 text-right">{r.score !== null ? formatPoints(r.score) : "—"}</td>
                  <td className="px-4 py-2 text-right text-destructive">{r.penalty > 0 ? `−${formatPoints(r.penalty)}` : ""}</td>
                  <td className="px-4 py-2 text-right font-semibold">{r.total !== null ? formatPoints(r.total) : "—"}</td>
                  <td className="max-w-xs truncate px-4 py-2 text-muted-foreground">{r.feedback}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {rows.grades.length > 40 && (
          <p className="px-4 pb-4 text-xs text-muted-foreground">Mostrando 40 de {rows.grades.length} linhas; a planilha traz todas.</p>
        )}
      </section>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="card-paper p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-display text-2xl font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
