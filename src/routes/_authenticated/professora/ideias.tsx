import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Lightbulb, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { AREAS, areaLabel } from "@/lib/project-code";
import { currentYear, ideaBankQuery, ideaUsageQuery, type Idea } from "@/lib/idea-bank";

export const Route = createFileRoute("/_authenticated/professora/ideias")({
  head: () => ({
    meta: [
      { title: "Banco de Inspirações — FECITI Flow" },
      { name: "description", content: "Cadastre, edite e remova as ideias de projeto que seus alunos veem na Etapa 1." },
      { property: "og:title", content: "Banco de Inspirações — FECITI Flow" },
      { property: "og:description", content: "Cadastre, edite e remova as ideias de projeto que seus alunos veem na Etapa 1." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(ideaBankQuery),
  component: IdeasPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="card-paper p-5 text-destructive">{error instanceof Error ? error.message : String(error)}</div>
  ),
  notFoundComponent: () => <div className="card-paper p-5">Página não encontrada.</div>,
});

type Form = { id?: string; area: string; theme: string; question: string; summary: string; bncc: string; year: number };

function IdeasPage() {
  const { data: ideas } = useSuspenseQuery(ideaBankQuery);
  const { data: usage = {} } = useQuery(ideaUsageQuery);
  const qc = useQueryClient();
  const [area, setArea] = useState("");
  const [year, setYear] = useState(currentYear());
  const years = useMemo(() => [...new Set([currentYear(), ...ideas.map((i) => i.year)])].sort((a, b) => b - a), [ideas]);
  const ofYear = useMemo(() => ideas.filter((i) => i.year === year), [ideas, year]);
  const EMPTY: Form = { area: "BIO", theme: "", question: "", summary: "", bncc: "", year };
  const copyPrevious = async () => {
    const prev = ideas.filter((i) => i.year === year - 1);
    if (!prev.length) { toast.error(`Não há ideias de ${year - 1}.`); return; }
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("idea_bank").insert(
      prev.map(({ area, theme, question, summary, bncc }) => ({ area, theme, question, summary, bncc, year, teacher_id: u.user!.id })),
    );
    if (error) { toast.error(error.message); return; }
    toast.success(`${prev.length} ideias de ${year - 1} copiadas para ${year}.`);
    refresh();
  };
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const list = useMemo(() => ofYear.filter((i) => !area || i.area === area), [ofYear, area]);
  const refresh = () => qc.invalidateQueries({ queryKey: ideaBankQuery.queryKey });

  const save = async () => {
    if (!form) return;
    if (!form.theme.trim()) { toast.error("Escreva o tema."); return; }
    setSaving(true);
    const row = {
      area: form.area,
      theme: form.theme.trim(),
      question: form.question.trim(),
      summary: form.summary.trim(),
      bncc: form.bncc.split(",").map((s) => s.trim()).filter(Boolean),
      year: Number(form.year) || year,
    };
    const { data: u } = await supabase.auth.getUser();
    const { error } = form.id
      ? await supabase.from("idea_bank").update(row).eq("id", form.id)
      : await supabase.from("idea_bank").insert({ ...row, teacher_id: u.user!.id });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(form.id ? "Ideia atualizada." : "Ideia cadastrada.");
    setForm(null);
    refresh();
  };

  const remove = async (i: Idea) => {
    if (!confirm(`Remover a ideia "${i.theme}"?`)) return;
    const { error } = await supabase.from("idea_bank").delete().eq("id", i.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Ideia removida.");
    refresh();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Banco de Inspirações"
        description="Os alunos veem só as ideias do ano atual. As de anos anteriores ficam guardadas aqui."
        actions={
          <div className="flex flex-wrap gap-2">
            <select aria-label="Ano" className="h-9 rounded-md border bg-background px-3 text-sm" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}{y === currentYear() ? " (atual)" : ""}</option>)}
              <option value={currentYear() + 1}>{currentYear() + 1} (próximo)</option>
            </select>
            {ofYear.length === 0 && <Button variant="outline" onClick={copyPrevious}>Copiar ideias de {year - 1}</Button>}
            <Button onClick={() => setForm(EMPTY)}>
              <Plus /> Nova ideia
            </Button>
          </div>
        }
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={area ? "outline" : "default"} onClick={() => setArea("")}>Todas ({ofYear.length})</Button>
        {AREAS.map((a) => (
          <Button key={a.code} size="sm" variant={area === a.code ? "default" : "outline"} onClick={() => setArea(a.code)}>
            {a.label} ({ofYear.filter((i) => i.area === a.code).length})
          </Button>
        ))}
      </div>
      {list.length === 0 ? (
        <EmptyState icon={<Lightbulb />} title="Nenhuma ideia nesta área" text="Clique em “Nova ideia” para cadastrar." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((i) => (
            <div key={i.id} className="card-paper p-4">
              <div className="mb-2 flex flex-wrap gap-1">
                <Badge variant="secondary">{areaLabel(i.area)}</Badge>
                {i.bncc.map((b) => (
                  <Badge key={b} variant="muted">{b}</Badge>
                ))}
              </div>
              {usage[i.id]?.length ? (
                <p className="mb-2 rounded-md bg-accent/20 px-2 py-1 text-xs font-medium">Já em uso por: {usage[i.id]!.map((u) => u.label).join(", ")}</p>
              ) : null}
              <p className="font-semibold">{i.theme}</p>
              {i.question && <p className="mt-1 text-sm italic">{i.question}</p>}
              {i.summary && <p className="mt-2 text-sm text-muted-foreground">{i.summary}</p>}
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setForm({ ...i, bncc: i.bncc.join(", ") })}>
                  <Pencil /> Editar
                </Button>
                <Button size="sm" variant="outline" onClick={() => remove(i)}>
                  <Trash2 /> Remover
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Editar ideia" : "Nova ideia"}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="area">Área</Label>
                <select
                  id="area"
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={form.area}
                  onChange={(e) => setForm({ ...form, area: e.target.value })}
                >
                  {AREAS.map((a) => (
                    <option key={a.code} value={a.code}>{a.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="year">Ano</Label>
                <Input id="year" type="number" value={form.year} onChange={(e) => setForm({ ...form, year: Number(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="theme">Tema</Label>
                <Input id="theme" value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="question">Pergunta norteadora de exemplo</Label>
                <Textarea id="question" rows={2} value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="summary">Resumo</Label>
                <Textarea id="summary" rows={4} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="bncc">Etiquetas BNCC (separadas por vírgula)</Label>
                <Input id="bncc" value={form.bncc} onChange={(e) => setForm({ ...form, bncc: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
