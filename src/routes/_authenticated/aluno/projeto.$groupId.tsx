import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Lock, MessageCircle, Plus, Save, Send, Star, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { PhaseTimeline } from "@/components/phase-timeline";
import { AiFeedback } from "@/components/ai-feedback";
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
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";
import { aiSuggestionsForGroupQuery, groupDetailQuery, meQuery } from "@/lib/queries";
import { latestPerPhase } from "@/lib/ai-score";
import {
  PHASE_COUNT,
  PHASE_FORM,
  SOURCE_TYPES,
  TEXT_FIELDS,
  BANNER_PHASE,
  BIMESTERS,
  isWrittenPart,
  parseArticles,
  phaseFields,
  phaseMeta,
  type Article,
  type TextFieldKey,
} from "@/lib/phases";
import {
  CITATION_FIELDS,
  WORD_LIMITS,
  countWords,
  limitLabel,
  objectiveLines,
  phaseProblems,
  referenceCheck,
  splitKeywords,
} from "@/lib/phase-rules";
import { CITATION_EXAMPLES, checkCitations } from "@/lib/citations";
import { fmtDateTime, whatsappLink } from "@/lib/format";
import { bimesterPenalties, formatPoints, gradeAfterPenalty, projectLateness } from "@/lib/penalty";
import { BannerStage } from "@/components/banner-stage";
import { bannerBrief } from "@/lib/banner";
import { ProjectAreaPicker, ProjectCodeTag } from "@/components/project-code";
import { SocialApplicationCard } from "@/components/social-application";
import { ProjectDocxButton } from "@/components/project-docx";

export const Route = createFileRoute("/_authenticated/aluno/projeto/$groupId")({
  head: () => ({
    meta: [
      { title: "Projeto do grupo — PamLab" },
      { name: "description", content: "Escreva o projeto científico do grupo, etapa por etapa." },
      { property: "og:title", content: "Projeto do grupo — PamLab" },
      { property: "og:description", content: "Escreva o projeto científico do grupo, etapa por etapa." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async ({ context, params }) => {
    const [g] = await Promise.all([
      context.queryClient.ensureQueryData(groupDetailQuery(params.groupId)),
      context.queryClient.ensureQueryData(aiSuggestionsForGroupQuery(params.groupId)),
    ]);
    if (!g) throw notFound();
  },
  component: StudentProjectPage,
});

type Project = Database["public"]["Tables"]["projects"]["Row"];
type Draft = Record<TextFieldKey, string> & { scientific_articles: Article[] };

function toDraft(p: Project): Draft {
  return {
    ...(Object.fromEntries(TEXT_FIELDS.map((k) => [k, p[k] ?? ""])) as Record<TextFieldKey, string>),
    scientific_articles: parseArticles(p.scientific_articles),
  };
}

/** Text the AI reads for a stage: the stage's own fields (plus the title, for context, in the abstract). */
function phaseText(d: Draft, phase: number) {
  if (phase === 2)
    return d.scientific_articles
      .map((a, i) => `${i + 1}. ${a.title}\n${a.url}\nCitação ABNT: ${a.abnt_citation}`)
      .join("\n\n");
  const fields = PHASE_FORM[phase] ?? [];
  if (fields.length === 1) return d[fields[0]!.key];
  const parts = fields.map((f) => `### ${f.label}\n${d[f.key]}`);
  if (phase === 12) parts.unshift(`### Título do projeto\n${d.title}`);
  return parts.join("\n\n");
}

function size(v: string | Article[]) {
  if (typeof v === "string") return v.length;
  return v.reduce((s, a) => s + a.title.length + a.url.length + a.abnt_citation.length, 0);
}

function StudentProjectPage() {
  const { groupId } = Route.useParams();
  const { data: me } = useSuspenseQuery(meQuery);
  const { data: group } = useSuspenseQuery(groupDetailQuery(groupId));
  const { data: aiEvaluations } = useSuspenseQuery(aiSuggestionsForGroupQuery(groupId));
  const aiByPhase = useMemo(() => latestPerPhase(aiEvaluations), [aiEvaluations]);
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
      setSelected((s) => Math.min(PHASE_COUNT, s + 1));
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
  const penalties = bimesterPenalties(lateness.phases);
  const isBanner = selected === BANNER_PHASE;
  const info = lateness.phases[selected - 1] ?? lateness.phases[0]!;
  const isSubmitted = info.state === "delivered";
  const editable = !isSubmitted && selected <= project.current_phase && info.state !== "skipped";
  const phaseDirty = changedFields.some((f) => phaseFields(selected).includes(f));
  const problems = phaseProblems(
    selected,
    isBanner
      ? { banner_canva_url: project.banner_canva_url, banner_file_path: project.banner_file_path, banner_template_url: cls.banner_template_url }
      : draft,
    draft.scientific_articles.length,
  );
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
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {project.area_code ? (
              <ProjectCodeTag area={project.area_code} classLabel={cls.code_label} seq={project.code_number} className="text-sm" />
            ) : (
              <span className="inline-flex items-center gap-2 text-sm">
                Escolha a área para gerar o código do projeto:
                <ProjectAreaPicker projectId={project.id} groupId={groupId} value={null} />
              </span>
            )}
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
          <div className="flex flex-wrap gap-2">
            <ProjectDocxButton
              project={project}
              groupName={group.group_name}
              authors={members.map((m) => m.profiles?.name ?? "").filter(Boolean)}
              cls={cls}
            />
            <ProjectDocxButton
              kind="plan"
              project={project}
              groupName={group.group_name}
              authors={members.map((m) => m.profiles?.name ?? "").filter(Boolean)}
              cls={cls}
            />
            {members.length > 1 && (
              <Button asChild variant="outline">
                <Link to="/aluno/avaliacao/$groupId" params={{ groupId }}>
                  <Star /> Avaliar colegas
                </Link>
              </Button>
            )}
          </div>
        }
      />

      <PhaseTimeline phases={lateness.phases} active={selected} onSelect={setSelected} />

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_300px]">
        <section className="card-paper p-6 md:p-8">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Etapa {selected}
                {isWrittenPart(selected) && " · Projeto escrito"}
              </p>
              <h2 className="text-2xl font-semibold">{phaseMeta(selected).name}</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{phaseMeta(selected).hint}</p>
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
            {isBanner ? (
              <BannerStage
                key={project.id}
                groupId={groupId}
                projectId={project.id}
                studentId={me!.id}
                brief={bannerBrief(cls)}
                canvaUrl={project.banner_canva_url}
                filePath={project.banner_file_path}
                fileName={project.banner_file_name}
                editable={editable}
              />
            ) : selected === 2 ? (
              <ArticlesEditor value={draft.scientific_articles} onChange={(v) => set("scientific_articles", v)} editable={editable} />
            ) : (
              (PHASE_FORM[selected] ?? []).map((f) => (
                <Field
                  key={f.key}
                  label={f.label}
                  id={f.key}
                  meter={<FieldMeter field={f.key} value={draft[f.key]} />}
                  before={
                    CITATION_FIELDS[f.key] ? (
                      <CitationGuide />
                    ) : f.key === "references_list" ? (
                      <ReferenceChecklist values={draft} />
                    ) : null
                  }
                >
                  {f.rows === 1 ? (
                    <Input id={f.key} value={draft[f.key]} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />
                  ) : (
                    <Textarea
                      id={f.key}
                      rows={f.rows}
                      value={draft[f.key]}
                      placeholder={f.placeholder}
                      onChange={(e) => set(f.key, e.target.value)}
                    />
                  )}
                </Field>
              ))
            )}
          </fieldset>

          {editable && selected === project.current_phase && problems.length > 0 && (
            <div className="mt-6 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
              <p className="font-medium text-foreground">Para entregar esta etapa, falta:</p>
              <ul className="mt-1 ml-5 list-disc text-muted-foreground">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}

          {editable && (
            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
              <p className="text-sm text-muted-foreground">
                {isBanner ? "O link e o arquivo são salvos na hora." : phaseDirty ? "Há alterações não salvas." : "Tudo salvo."}
                {info.daysLate > 0 &&
                  ` · ${info.daysLate} dia(s) de atraso (−${formatPoints(info.penalty)} até agora)`}
              </p>
              <div className="flex gap-2">
                {!isBanner && (
                  <Button variant="outline" onClick={save} disabled={!phaseDirty || saveMutation.isPending}>
                    <Save /> Salvar
                  </Button>
                )}
                {selected === project.current_phase && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button disabled={submitMutation.isPending || problems.length > 0}>
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

          {!isBanner && (
          <AiFeedback
            key={selected}
            projectId={project.id}
            groupId={groupId}
            phaseNumber={selected}
            text={phaseText(draft, selected)}
            saved={
              aiByPhase[selected]
                ? { evaluation: aiByPhase[selected].latest, createdAt: aiByPhase[selected].latest.createdAt }
                : null
            }
          />
          )}
        </section>

        <aside className="space-y-4">
          <SocialApplicationCard
            key={project.social_application ?? ""}
            value={project.social_application}
            projectId={project.id}
            groupId={groupId}
            studentId={me?.id}
            editable={project.current_phase > 3}
            hint={
              project.current_phase > 3
                ? "Ainda não escrita. Clique em Escrever."
                : "Escreva na etapa 3, logo abaixo da pergunta norteadora."
            }
            onSaved={(v) => set("social_application", v)}
          />
          <div className="card-paper p-5">
            <h3 className="mb-3 text-lg font-semibold">Notas</h3>
            <ul className="space-y-3">
              {BIMESTERS.map(({ number: t, title }) => {
                const g = grades.find((x) => x.trimester === t);
                const penalty = penalties[t] ?? 0;
                const total = g ? gradeAfterPenalty(Number(g.score), penalty) : null;
                return (
                  <li key={t} className="rounded-lg bg-muted p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        {t}º bimestre <span className="block text-xs font-normal text-muted-foreground">{title}</span>
                      </span>
                      <span className="font-display text-xl font-semibold">{total !== null ? formatPoints(total) : "—"}</span>
                    </div>
                    {g ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Nota {formatPoints(Number(g.score))}
                        {penalty > 0 && ` − ${formatPoints(penalty)} de atraso`}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">Ainda não lançada</p>
                    )}
                    {g?.feedback && <p className="mt-1 text-sm text-muted-foreground">{g.feedback}</p>}
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="card-paper p-5 text-sm text-muted-foreground">
            Desconto por atraso nesta turma: <strong className="text-foreground">{formatPoints(Number(cls.late_penalty_per_day))}</strong>{" "}
            ponto por dia, descontado só da nota do bimestre da etapa atrasada. Acumulado do grupo:{" "}
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

function Field({
  label,
  id,
  meter,
  before,
  children,
}: {
  label: string;
  id: string;
  meter?: React.ReactNode;
  before?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      {before}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Label htmlFor={id} className="text-sm font-semibold">
          {label}
        </Label>
        {meter}
      </div>
      {children}
    </div>
  );
}

/** Live list of the works cited in Introdução and Resultados, ticked when the reference list has them. */
function ReferenceChecklist({ values }: { values: Partial<Record<string, unknown>> }) {
  const items = referenceCheck(values);
  const missing = items.filter((i) => !i.found).length;
  return (
    <div className="mb-3 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
      <p className="font-semibold text-foreground">Conferência das citações</p>
      <p className="mt-1 text-muted-foreground">
        Toda obra citada na Introdução e em Resultados e discussão precisa estar aqui, com o mesmo sobrenome e o mesmo
        ano. Ex.: (Silva, 2020) → <span className="font-mono text-xs">SILVA, J. Título da obra. Cidade: Editora, 2020.</span>
      </p>
      {items.length === 0 ? (
        <p className="mt-3 text-muted-foreground">Nenhuma citação encontrada na Introdução nem em Resultados e discussão.</p>
      ) : (
        <>
          <p className={cn("mt-3 text-xs font-medium", missing ? "text-destructive" : "text-success")}>
            {missing ? `${missing} de ${items.length} obra(s) citada(s) ainda faltam` : `Todas as ${items.length} obra(s) citada(s) estão nas Referências`}
          </p>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {items.map(({ work, label, found }) => (
              <li key={`${work.citation}|${work.year}|${work.authors}`} className="flex items-start gap-2 rounded-md bg-background p-2">
                {found ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-label="Encontrada" />
                ) : (
                  <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-label="Faltando" />
                )}
                <span>
                  <span className="font-mono text-xs text-foreground">{work.authors}, {work.year}</span>
                  <span className="block text-xs text-muted-foreground">{label}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** ABNT in-text citation examples, shown above the parts where citations are mandatory. */
function CitationGuide() {
  return (
    <div className="mb-3 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
      <p className="font-semibold text-foreground">Obrigatório: citar os autores nas normas ABNT (NBR 10520:2023)</p>
      <p className="mt-1 text-muted-foreground">
        Toda ideia tirada de um artigo precisa da citação: sobrenome do autor e ano. Dentro dos parênteses, escreva o
        nome com a primeira letra maiúscula (siglas podem ser todas maiúsculas). A etapa só pode ser entregue com pelo
        menos uma citação correta, e toda obra citada precisa aparecer depois nas Referências.
      </p>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        {CITATION_EXAMPLES.map((e) => (
          <div key={e.label} className="rounded-md bg-background p-2.5">
            <dt className="text-xs text-muted-foreground">{e.label}</dt>
            <dd className="mt-0.5 font-mono text-xs text-foreground">{e.example}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Live counter for a field: words against the limit, objectives per line, or keywords. */
function FieldMeter({ field, value }: { field: TextFieldKey; value: string }) {
  if (field === "keywords") {
    const n = splitKeywords(value).length;
    const ok = n >= 3 && n <= 5;
    return <span className={cn("text-xs", ok ? "text-success" : "text-destructive")}>{n} palavra(s)-chave · de 3 a 5</span>;
  }
  const lim = WORD_LIMITS[field];
  if (!lim) return null;
  const n = countWords(value);
  const ok = n >= lim.min && (lim.max === null || n <= lim.max);
  const cites = CITATION_FIELDS[field] ? checkCitations(value) : null;
  const citesOk = !cites || (cites.citations.length > 0 && cites.issues.length === 0);
  return (
    <span className="flex flex-wrap gap-x-2 text-xs">
      <span className={ok ? "text-success" : "text-destructive"}>
        {field === "specific_objectives" && `${objectiveLines(value).length} de no máx. 5 objetivos · `}
        {n} palavra(s){lim.max !== null && ` · ${limitLabel(lim)}`}
      </span>
      {cites && (
        <span className={citesOk ? "text-success" : "text-destructive"}>
          · {cites.citations.length} citação(ões) ABNT
          {cites.issues.length > 0 && `, ${cites.issues.length} com erro`}
        </span>
      )}
    </span>
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
