import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Download, Trophy } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { teacherExternalFairsQuery } from "@/lib/queries";
import { EXTERNAL_FAIRS } from "@/lib/ethics";
import { ETHICS_STATUS_LABEL, externalFairRows, type EthicsStatus } from "@/lib/external-fairs-list";
import { downloadBlob } from "@/lib/export-xlsx";
import { supabase } from "@/integrations/supabase/client";
import { SHIRT_SIZES, formatCpf } from "@/lib/fair-attendees";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FAIR_STATUS_LABEL } from "@/lib/fair-docs";
import { FairBannerModelsManager, FairTemplatesManager } from "@/components/fair-accreditation";

export const Route = createFileRoute("/_authenticated/professora/feiras")({
  head: () => ({
    meta: [
      { title: "Feiras externas — FECITI Flow" },
      { name: "description", content: "Grupos que querem ir para a FETEC/MS e a FECINTEC, com a triagem de ética." },
      { property: "og:title", content: "Feiras externas — FECITI Flow" },
      { property: "og:description", content: "Grupos que querem ir para a FETEC/MS e a FECINTEC, com a triagem de ética." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(teacherExternalFairsQuery),
  component: FairsPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="card-paper p-5 text-destructive">{error instanceof Error ? error.message : String(error)}</div>
  ),
  notFoundComponent: () => <div className="card-paper p-5">Página não encontrada.</div>,
});

const ETHICS_VARIANT: Record<EthicsStatus, "secondary" | "warning" | "success" | "destructive"> = {
  pending: "secondary",
  no_humans: "success",
  ok: "success",
  incomplete: "destructive",
};

function FairsPage() {
  const { data } = useSuspenseQuery(teacherExternalFairsQuery);
  const all = useMemo(() => externalFairRows(data), [data]);
  const [fair, setFair] = useState<string>("all");
  const qc = useQueryClient();
  const ids = all.map((r) => r.groupId);
  const { data: approvals = [] } = useQuery({
    queryKey: ["fair-approvals", ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("fair_approvals").select("group_id, status").in("group_id", ids);
      if (error) throw error;
      return data ?? [];
    },
  });
  async function decide(groupId: string, status: string) {
    const { data: u } = await supabase.auth.getUser();
    const { error } = status === "pendente"
      ? await supabase.from("fair_approvals").delete().eq("group_id", groupId)
      : await supabase.from("fair_approvals").upsert({ group_id: groupId, status, teacher_id: u.user?.id ?? null, decided_at: new Date().toISOString() }, { onConflict: "group_id" });
    if (error) { toast.error("Não foi possível salvar a decisão."); return; }
    toast.success(status === "aprovado" ? "Aprovado: o grupo já pode baixar o modelo oficial." : "Decisão salva.");
    qc.invalidateQueries({ queryKey: ["fair-approvals"] });
    qc.invalidateQueries({ queryKey: ["fair-accreditation", groupId] });
  }
  const rows = fair === "all" ? all : all.filter((r) => r.fairs.includes(fair as (typeof EXTERNAL_FAIRS)[number]));

  async function exportSheet() {
    try {
      const { default: ExcelJS } = await import("exceljs");
      const wb = new ExcelJS.Workbook();
      wb.creator = "FECITI Flow";
      const ws = wb.addWorksheet("Feiras externas", { views: [{ state: "frozen", ySplit: 1 }] });
      ws.columns = [
        { header: "Código", key: "code", width: 16 },
        { header: "Turma", key: "className", width: 16 },
        { header: "Grupo", key: "groupName", width: 22 },
        { header: "Título / tema", key: "title", width: 40 },
        { header: "Integrantes", key: "members", width: 36 },
        { header: "Feiras", key: "fairs", width: 22 },
        { header: "Etapa atual", key: "phase", width: 10 },
        { header: "Triagem de ética", key: "ethics", width: 34 },
        { header: "Link do Forms", key: "formUrl", width: 40 },
      ];
      ws.getRow(1).font = { bold: true };
      rows.forEach((r) =>
        ws.addRow({
          ...r,
          code: r.code ?? "",
          fairs: r.fairs.join(" + "),
          ethics: ETHICS_STATUS_LABEL[r.ethics],
          formUrl: r.formUrl ?? "",
        }),
      );
      const buf = await wb.xlsx.writeBuffer();
      downloadBlob(new Blob([buf]), "feiras-externas.xlsx");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar a planilha.");
    }
  }

  async function exportAttendees() {
    try {
      const { data: att, error } = await supabase
        .from("fair_attendees")
        .select("*, groups(group_name, classes(name), projects(external_fairs))")
        .order("full_name");
      if (error) throw error;
      const { default: ExcelJS } = await import("exceljs");
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Inscrições", { views: [{ state: "frozen", ySplit: 1 }] });
      ws.columns = [
        { header: "Nome completo", key: "n", width: 34 },
        { header: "CPF", key: "cpf", width: 16 },
        { header: "Nascimento", key: "b", width: 12 },
        { header: "Camiseta", key: "s", width: 10 },
        { header: "WhatsApp", key: "w", width: 16 },
        { header: "Responsável", key: "gn", width: 28 },
        { header: "Tel. responsável", key: "gp", width: 16 },
        { header: "Restrição alimentar", key: "d", width: 28 },
        { header: "Turma", key: "c", width: 14 },
        { header: "Grupo", key: "g", width: 22 },
        { header: "Feiras", key: "f", width: 22 },
      ];
      ws.getRow(1).font = { bold: true };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (att ?? []).forEach((a: any) => {
        const proj = Array.isArray(a.groups?.projects) ? a.groups.projects[0] : a.groups?.projects;
        ws.addRow({
          n: a.full_name, cpf: formatCpf(a.cpf), b: a.birth_date ? a.birth_date.split("-").reverse().join("/") : "",
          s: a.shirt_size, w: a.whatsapp ?? "", gn: a.guardian_name ?? "", gp: a.guardian_phone ?? "", d: a.dietary ?? "",
          c: a.groups?.classes?.name ?? "", g: a.groups?.group_name ?? "", f: (proj?.external_fairs ?? []).join(" + "),
        });
      });
      const sizes = new Map<string, number>();
      (att ?? []).forEach((a) => sizes.set(a.shirt_size, (sizes.get(a.shirt_size) ?? 0) + 1));
      const t = wb.addWorksheet("Camisetas");
      t.addRow(["Tamanho", "Quantidade"]).font = { bold: true };
      SHIRT_SIZES.forEach((s) => t.addRow([s, sizes.get(s) ?? 0]));
      const buf = await wb.xlsx.writeBuffer();
      downloadBlob(new Blob([buf]), "inscricoes-feiras-externas.xlsx");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar a planilha.");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Feiras externas"
        description="Todos os grupos das suas turmas que querem participar da FETEC/MS ou da FECINTEC."
      />
      <FairBannerModelsManager fairs={EXTERNAL_FAIRS} />
      <FairTemplatesManager />

      <div className="flex flex-wrap items-center gap-2">
        {["all", ...EXTERNAL_FAIRS].map((f) => (
          <Button key={f} size="sm" variant={fair === f ? "default" : "outline"} onClick={() => setFair(f)}>
            {f === "all" ? `Todas (${all.length})` : `${f} (${all.filter((r) => r.fairs.includes(f as (typeof EXTERNAL_FAIRS)[number])).length})`}
          </Button>
        ))}
        <Button size="sm" variant="secondary" className="ml-auto" onClick={exportSheet} disabled={!rows.length}>
          <Download /> Baixar planilha
        </Button>
        <Button size="sm" variant="secondary" onClick={exportAttendees}>
          <Download /> Planilha de inscrições (CPF, camiseta)
        </Button>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<Trophy />} title="Nenhum grupo ainda" text="Quando um grupo marcar interesse em feira externa, ele aparece aqui." />
      ) : (
        <div className="card-paper overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-muted-foreground">
              <tr>
                <th className="p-3">Código</th>
                <th className="p-3">Turma / grupo</th>
                <th className="p-3">Integrantes</th>
                <th className="p-3">Feiras</th>
                <th className="p-3">Etapa</th>
                <th className="p-3">Triagem de ética</th>
                <th className="p-3">Aprovação na feira</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.groupId} className="border-b last:border-0 align-top">
                  <td className="p-3 font-mono">{r.code ?? "—"}</td>
                  <td className="p-3">
                    <Link to="/professora/grupo/$groupId" params={{ groupId: r.groupId }} className="font-medium text-primary hover:underline">
                      {r.groupName}
                    </Link>
                    <div className="text-xs text-muted-foreground">{r.className}{r.title ? ` · ${r.title}` : ""}</div>
                  </td>
                  <td className="p-3">{r.members || "—"}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {r.fairs.length ? r.fairs.map((f) => <Badge key={f} variant="highlight">{f}</Badge>) : <Badge variant="warning">Não escolheu</Badge>}
                    </div>
                  </td>
                  <td className="p-3">{r.phase}</td>
                  <td className="p-3">
                    <Badge variant={ETHICS_VARIANT[r.ethics]}>{ETHICS_STATUS_LABEL[r.ethics]}</Badge>
                    {r.formUrl && (
                      <a href={r.formUrl} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-primary hover:underline">
                        Abrir Forms
                      </a>
                    )}
                  </td>
                  <td className="p-3">
                    <Select value={approvals.find((a) => a.group_id === r.groupId)?.status ?? "pendente"} onValueChange={(v) => decide(r.groupId, v)}>
                      <SelectTrigger className="w-48" aria-label={`Aprovação de ${r.groupName}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pendente">Pendente</SelectItem>
                        {Object.entries(FAIR_STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
