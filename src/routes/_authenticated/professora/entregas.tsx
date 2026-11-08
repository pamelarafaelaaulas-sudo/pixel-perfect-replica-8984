import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Check, ClipboardList } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { PHASES } from "@/lib/phases";
import { fmtDate } from "@/lib/format";

const deliveriesQuery = queryOptions({
  queryKey: ["teacher", "deliveries"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("classes")
      .select("id, name, groups!groups_class_id_fkey(id, group_name, projects(theme, phase_submissions(phase_number, submitted_at)))")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
});

export const Route = createFileRoute("/_authenticated/professora/entregas")({
  head: () => ({
    meta: [
      { title: "Entregas por etapa — FECITI Flow" },
      { name: "description", content: "Quais grupos já entregaram cada etapa e o tema de cada um, por turma." },
      { property: "og:title", content: "Entregas por etapa — FECITI Flow" },
      { property: "og:description", content: "Quais grupos já entregaram cada etapa e o tema de cada um, por turma." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { turma?: string } => (typeof s["turma"] === "string" ? { turma: s["turma"] } : {}),
  loader: ({ context }) => context.queryClient.ensureQueryData(deliveriesQuery),
  component: DeliveriesPage,
});

/** First line of the theme field (ideas append the summary after a blank line). */
const themeTitle = (t: string | null | undefined) => (t ?? "").split("\n")[0]!.trim();

function DeliveriesPage() {
  const { data: classes } = useSuspenseQuery(deliveriesQuery);
  const { turma } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const cls = classes.find((c) => c.id === turma) ?? classes[0];
  const groups = [...(cls?.groups ?? [])].sort((a, b) => a.group_name.localeCompare(b.group_name));

  return (
    <>
      <PageHeader
        eyebrow="Painel da professora"
        title="Entregas por etapa"
        description="Veja quais grupos já entregaram cada etapa e o tema que cada um escolheu."
        actions={
          cls && (
            <Select value={cls.id} onValueChange={(v) => navigate({ search: { turma: v } })}>
              <SelectTrigger className="w-56" aria-label="Escolher turma"><SelectValue /></SelectTrigger>
              <SelectContent>
                {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )
        }
      />
      {groups.length === 0 ? (
        <EmptyState icon={<ClipboardList className="size-5" />} title="Nenhum grupo nesta turma" text="Quando os alunos formarem grupos, as entregas aparecem aqui." />
      ) : (
        <div className="card-paper overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="sticky left-0 bg-card p-3">Grupo</th>
                <th className="min-w-56 p-3">Tema</th>
                {PHASES.map((p) => <th key={p.number} className="p-2 text-center text-xs font-medium" title={p.name}>{p.number}. {p.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const subs = new Map((g.projects?.phase_submissions ?? []).map((s) => [s.phase_number, s.submitted_at]));
                return (
                  <tr key={g.id} className="border-b last:border-0">
                    <td className="sticky left-0 bg-card p-3 font-medium">
                      <Link to="/professora/grupo/$groupId" params={{ groupId: g.id }} className="hover:text-primary hover:underline">{g.group_name}</Link>
                    </td>
                    <td className="p-3">{themeTitle(g.projects?.theme) || <span className="text-muted-foreground">Sem tema</span>}</td>
                    {PHASES.map((p) => {
                      const at = subs.get(p.number);
                      return (
                        <td key={p.number} className="p-2 text-center">
                          {at ? (
                            <span className="inline-flex flex-col items-center text-success" title={`Entregue em ${fmtDate(at)}`}>
                              <Check className="size-4" /><span className="text-[10px]">{fmtDate(at)}</span>
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
