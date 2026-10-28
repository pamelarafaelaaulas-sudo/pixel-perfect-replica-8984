import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, Lock, MessageCircle, Plus, Save, Send, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { PhaseTimeline } from "@/components/phase-timeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { groupDetailQuery, meQuery } from "@/lib/queries";
import { PHASES, SOURCE_TYPES, TRIMESTERS, WRITTEN_SECTIONS, parseArticles, type Article, phaseMeta } from "@/lib/phases";
import { fmtDateTime, whatsappLink } from "@/lib/format";
import { formatPoints, projectLateness } from "@/lib/penalty";

export const Route = createFileRoute("/_authenticated/aluno/projeto/$groupId")({
  head: () => ({
    meta: [
      { title: "Projeto do grupo — Caderno de Projetos" },
      { name: "description", content: "Escreva o projeto científico do grupo, etapa por etapa." },
      { property: "og:title", content: "Projeto do grupo — Caderno de Projetos" },
      { property: "og:description", content: "Escreva o projeto científico do grupo, etapa por etapa." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async ({ context, params }) => {
    const g = await context.queryClient.ensureQueryData(groupDetailQuery(params.groupId));
    if (!g) throw notFound();
  },
  component: StudentProjectPage,
});

type Project = Database["public"]["Tables"]["projects"]["Row"];
type TextField = "theme" | "guiding_question" | (typeof WRITTEN_SECTIONS)[number]["key"];
type Draft = Record<TextField, string> & { scientific_articles: Article[] };

const PHASE_FIELDS: Record<number, (TextField | "scientific_articles")[]> = {
  1: ["theme"],
  2: ["scientific_articles"],
  3: ["guiding_question"],
  4: WRITTEN_SECTIONS.map((s) => s.key),
};

function toDraft(p: Project): Draft {
  return {
    theme: p.theme ?? "",
    guiding_question: p.guiding_question ?? "",
    scientific_articles: parseArticles(p.scientific_articles),
    ...(Object.fromEntries(WRITTEN_SECTIONS.map((s) => [s.key, p[s.key] ?? ""])) as Record<
      (typeof WRITTEN_SECTIONS)[number]["key"],
      string
    >),
  };
}

function size(v: string | Article[]) {
  if (typeof v === "string") return v.length;
  return v.reduce((s, a) => s + a.title.length + a.url.length + a.abnt_citation.length, 0);
}

function StudentProjectPage() {
  const { groupId } = Route.useParams();
  const { data: me } = useSuspenseQuery(meQuery);
  const { data: group } = useSuspenseQuery(groupDetailQuery(groupId));
  const qc = useQueryClient();
  const project = group?.projects ?? null;

  const [selected, setSelected] = useState<number>(project?.current_phase ?? 1);
  const [draft, setDraft] = useState<Draft | null>(project ? toDraft(project) : null);
  const saved = useMemo(() => (project ? toDraft(project) : null), [project]);

  const changedFields = useMemo(() => {
    if (!draft || !saved) return [];
    return (Object.keys(draft) as (keyof Draft)[]).filter(
      (k) => JSON.stringify(draft[k]) !== JSON.stringify(saved[k]),
    );
  }, [draft, saved]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!project || !draft || !saved || changedFields.length === 0) return;
      const patch: Partial<Project> = {};
      for (const k of changedFields) {
        if (k === "scientific_articles") patch.scientific_articles = draft.scientific_articles;
        else patch[k] = draft[k].trim() === "" ? null : draft[k];
      }
      const { error } = await supabase.from("projects").update(patch).eq("id", project.id);
      if (error) throw error;
      const rows = changedFields.map((k) => ({
        project_id: project.id,
        student_id: me!.id,
        section_name: k,
        char_count_added: Math.max(0, size(draft[k]) - size(saved[k])),
      }));
      const c = await supabase.from("project_contributions").insert(rows);
      if (c.error) throw c.error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["group", groupId] }),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (changedFields.length) await saveMutation.mutateAsync();
      const { error } = await supabase.rpc("submit_phase", { _project_id: project!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Etapa entregue para a professora!");
      qc.invalidateQueries({ queryKey: ["group", groupId] });
      qc.invalidateQueries({ queryKey: ["student"] });
      setSelected((s) => Math.min(4, s + 1));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!group || !group.classes || !project || !draft) return null;
  const cls = group.classes;
  const members = group.group_members ?? [];
  const submissions = project.phase_submissions ?? [];
  const lateness = projectLateness({
    currentPhase: project.current_phase,
    schedules: cls.schedules ?? [],
    submissions,
    perDay: Number(cls.late_penalty_per_day),
  });
  const info = lateness.phases[selected - 1];
  const isSubmitted = info.state === "delivered";
  const editable = !isSubmitted && selected <= project.current_phase && info.state !== "skipped";
  const phaseDirty = changedFields.some((f) => PHASE_FIELDS[selected].includes(f));
  const grades = [...(group.grades ?? [])].sort((a, b) => a.trimester - b.trimester);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  async function save() {
    try {
      await saveMutation.mutateAsync();
      toast.success("Salvo!");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <Link to="/aluno" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Meus projetos
      </Link>
      <PageHeader
        eyebrow={cls.name}
        title={group.group_name}
        description={
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            {members.map((m) => (
              <a
                key={m.id}
                href={whatsappLink(m.whatsapp)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm hover:text-primary"
              >
                <MessageCircle className="size-3.5" /> {m.profiles?.name}
                {m.student_id === me?.id && " (você)"}
              </a>
            ))}
          </span>
        }
        actions={
          members.length > 1 && (
            <Button asChild variant="outline">
              <Link to="/aluno/avaliacao/$groupId" params={{ groupId }}>
                <Star /> Avaliar colegas
              </Link>
            </Button>
          )
        }
      />

      <PhaseTimeline phases={lateness.phases} active={selected} onSelect={setSelected} />

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_300px]">
        <section className="card-paper p-6 md:p-8">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Etapa {selected}</p>
              <h2 className="text-2xl font-semibold">{phaseMeta(selected).name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{phaseMeta(selected).hint}</p>
            </div>
            {isSubmitted ? (
              <Badge variant={info.daysLate > 0 ? "warning" : "success"}>Entregue em {fmtDateTime(info.submittedAt)}</Badge>
            ) : !editable ? (
              <Badge variant="muted">
                <Lock className="mr-1 size-3" /> Bloqueada
              </Badge>
            ) : (
              <Badge variant="secondary">Prazo: {fmtDateTime(info.dueDate)}</Badge>
            )}
          </div>

          <fieldset disabled={!editable} className="space-y-5">
            {selected === 1 && (
              <Field label="Tema do projeto" id="theme">
                <Textarea
                  id="theme"
                  rows={5}
                  value={draft.theme}
                  onChange={(e) => set("theme", e.target.value)}
                  placeholder="Sobre o que o grupo vai pesquisar e por quê?"
                />
              </Field>
            )}

            {selected === 2 && (
              <ArticlesEditor value={draft.scientific_articles} onChange={(v) => set("scientific_articles", v)} editable={editable} />
            )}

            {selected === 3 && (
              <Field label="Pergunta norteadora" id="gq">
                <Textarea
                  id="gq"
                  rows={4}
                  value={draft.guiding_question}
                  onChange={(e) => set("guiding_question", e.target.value)}
                  placeholder="Ex.: De que forma o descarte de óleo de cozinha afeta a qualidade da água do bairro?"
                />
              </Field>
            )}

            {selected === 4 &&
              WRITTEN_SECTIONS.map((s) => (
                <Field key={s.key} label={s.label} id={s.key} count={draft[s.key].length}>
                  {s.rows === 1 ? (
                    <Input id={s.key} value={draft[s.key]} onChange={(e) => set(s.key, e.target.value)} />
                  ) : (
                    <Textarea id={s.key} rows={s.rows} value={draft[s.key]} onChange={(e) => set(s.key, e.target.value)} />
                  )}
                </Field>
              ))}
          </fieldset>

          {editable && (
            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
              <p className="text-sm text-muted-foreground">
                {phaseDirty ? "Há alterações não salvas." : "Tudo salvo."}
                {info.daysLate > 0 &&
                  ` · ${info.daysLate} dia(s) de atraso (−${formatPoints(info.penalty)} até agora)`}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={save} disabled={!phaseDirty || saveMutation.isPending}>
                  <Save /> Salvar
                </Button>
                {selected === project.current_phase && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button disabled={submitMutation.isPending}>
                        <Send /> Entregar etapa
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Entregar “{phaseMeta(selected).name}”?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Depois de entregue, a etapa não pode mais ser editada pelo grupo (só a professora pode reabrir).
                          {info.daysLate > 0 &&
                            ` A entrega está ${info.daysLate} dia(s) atrasada: desconto de ${formatPoints(info.penalty)} ponto(s).`}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => submitMutation.mutate()}>Entregar</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <div className="card-paper p-5">
            <h3 className="mb-3 text-lg font-semibold">Notas</h3>
            <ul className="space-y-3">
              {TRIMESTERS.map((t) => {
                const g = grades.find((x) => x.trimester === t);
                return (
                  <li key={t} className="rounded-lg bg-muted p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{t}º trimestre</span>
                      <span className="font-display text-xl font-semibold">{g ? formatPoints(Number(g.score)) : "—"}</span>
                    </div>
                    {g?.feedback && <p className="mt-1 text-sm text-muted-foreground">{g.feedback}</p>}
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="card-paper p-5 text-sm text-muted-foreground">
            Desconto por atraso nesta turma: <strong className="text-foreground">{formatPoints(Number(cls.late_penalty_per_day))}</strong>{" "}
            ponto por dia. Acumulado do grupo:{" "}
            <strong className={lateness.totalPenalty > 0 ? "text-destructive" : "text-foreground"}>
              {formatPoints(lateness.totalPenalty)}
            </strong>
            .
          </div>
        </aside>
      </div>
    </>
  );
}

function Field({ label, id, count, children }: { label: string; id: string; count?: number; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <Label htmlFor={id} className="text-sm font-semibold">
          {label}
        </Label>
        {count !== undefined && <span className="text-xs text-muted-foreground">{count} caracteres</span>}
      </div>
      {children}
    </div>
  );
}

function ArticlesEditor({
  value,
  onChange,
  editable,
}: {
  value: Article[];
  onChange: (v: Article[]) => void;
  editable: boolean;
}) {
  const update = (i: number, patch: Partial<Article>) => onChange(value.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  return (
    <div className="space-y-4">
      {value.length === 0 && <p className="text-sm italic text-muted-foreground">Nenhum artigo adicionado ainda.</p>}
      {value.map((a, i) => (
        <div key={i} className="space-y-3 rounded-lg border border-border p-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-muted-foreground">FONTE {i + 1}</span>
            {editable && (
              <Button type="button" variant="ghost" size="icon" aria-label="Remover fonte" onClick={() => onChange(value.filter((_, j) => j !== i))}>
                <Trash2 />
              </Button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
            <Input placeholder="Título" value={a.title} onChange={(e) => update(i, { title: e.target.value })} aria-label="Título" />
            <Select value={a.source_type} onValueChange={(v) => update(i, { source_type: v })} disabled={!editable}>
              <SelectTrigger aria-label="Tipo de fonte">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Input placeholder="Link (https://...)" value={a.url} onChange={(e) => update(i, { url: e.target.value })} aria-label="Link" />
          <Textarea
            rows={2}
            placeholder="Citação ABNT. Ex.: SOBRENOME, Nome. Título. Revista, v. 1, n. 2, p. 10-20, 2024."
            value={a.abnt_citation}
            onChange={(e) => update(i, { abnt_citation: e.target.value })}
            aria-label="Citação ABNT"
          />
        </div>
      ))}
      {editable && (
        <Button
          type="button"
          variant="outline"
          onClick={() => onChange([...value, { title: "", url: "", source_type: SOURCE_TYPES[0], abnt_citation: "" }])}
        >
          <Plus /> Adicionar fonte
        </Button>
      )}
    </div>
  );
}
