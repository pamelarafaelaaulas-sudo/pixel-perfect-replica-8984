import { classMedalsQuery } from "@/lib/queries";
import { MEDAL_EMOJI, MEDAL_LABEL } from "@/lib/medals";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Lock, MessageCircle, Plus, Save, Send, Star, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { ResearchPromptCard } from "@/components/research-prompt";
import { ResearchTutorial } from "@/components/research-tutorial";
import { IdeaBank } from "@/components/idea-bank";
import { PageHeader } from "@/components/page-header";
import { GroupResponsibilities } from "@/components/group-responsibilities";
import { PhaseTimeline } from "@/components/phase-timeline";
import { AiFeedback } from "@/components/ai-feedback";
import { useServerFn } from "@tanstack/react-start";
import { getPhaseEvaluation } from "@/lib/ai-feedback.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { articleProblems, extractDoi, lookupDoi, MIN_YEAR } from "@/lib/article-check";
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
import { useLiveCollab } from "@/hooks/use-live-collab";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";
import { aiSuggestionsForGroupQuery, diaryGradesQuery, groupDetailQuery, meQuery } from "@/lib/queries";
import { latestPerPhase } from "@/lib/ai-score";
import { parseTables, tableProblems, tableColumnOf, TABLE_COLUMN_LIST, type ResultTable, type TableColumn } from "@/lib/result-tables";
import { ResultTablesEditor } from "@/components/result-tables";
import { CHART_COLUMN_LIST, chartColumnOf, parseCharts, type ChartColumn, type StageChart } from "@/lib/stage-charts";
import { StageChartsEditor } from "@/components/stage-charts";
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
import { articleCitationHint, buildAbntReference, citationsWithoutArticle, importArticleReferences, uncitedReferences } from "@/lib/article-links";
import { fmtDateTime, whatsappLink } from "@/lib/format";
import { bimesterBase, bimesterPenalties, formatPoints, gradeAfterPenalty, projectLateness } from "@/lib/penalty";
import { BannerStage } from "@/components/banner-stage";
import { StudentBannerCorrector } from "@/components/banner-cycle";
import { EthicsScreening } from "@/components/ethics-screening";
import { ExternalFairsCard } from "@/components/external-fairs";
import { DiaryVideoStep, ReferencesVideoStep } from "@/components/video-trail";
import { DiaryCard } from "@/components/diary";
import { StudentFairCard } from "@/components/fair-accreditation";
import { bannerBrief } from "@/lib/banner";
import { ProjectAreaPicker, ProjectCodeTag } from "@/components/project-code";
import { ProjectDocxButton } from "@/components/project-docx";
import { StudentWrittenFeedback, StudentWrittenResubmit, stageReviews, useWrittenRoundsSync } from "@/components/written-review";
import { writtenPhaseText } from "@/lib/written-review";

export const Route = createFileRoute("/_authenticated/aluno/projeto/$groupId")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Projeto do grupo — FECITI Flow" },
      { name: "description", content: "Escreva o projeto científico do grupo, etapa por etapa." },
      { property: "og:title", content: "Projeto do grupo — FECITI Flow" },
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
type Draft = Record<TextFieldKey, string> & { scientific_articles: Article[] } & Record<TableColumn, ResultTable[]> & Record<ChartColumn, StageChart[]>;

function toDraft(p: Project): Draft {
  return {
    ...(Object.fromEntries(TEXT_FIELDS.map((k) => [k, p[k] ?? ""])) as Record<TextFieldKey, string>),
    scientific_articles: parseArticles(p.scientific_articles),
    ...(Object.fromEntries(TABLE_COLUMN_LIST.map((c) => [c, parseTables(p[c])])) as Record<TableColumn, ResultTable[]>),
    ...(Object.fromEntries(CHART_COLUMN_LIST.map((c) => [c, parseCharts(p[c])])) as Record<ChartColumn, StageChart[]>),
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

function size(v: string | Article[] | ResultTable[] | StageChart[]) {
  if (typeof v === "string") return v.length;
  const first = v[0];
  if (first && "points" in first) return JSON.stringify(v).length;
  if (first && "rows" in first) return (v as ResultTable[]).reduce((s, t) => s + t.rows.flat().join("").length, 0);
  return (v as Article[]).reduce((s, a) => s + a.title.length + a.url.length + a.abnt_citation.length, 0);
}
function StudentProjectPage() {
  const { groupId } = Route.useParams();
  const { data: me } = useSuspenseQuery(meQuery);
  const { data: group } = useSuspenseQuery(groupDetailQuery(groupId));
  const { data: aiEvaluations } = useSuspenseQuery(aiSuggestionsForGroupQuery(groupId));
  const aiByPhase = useMemo(() => latestPerPhase(aiEvaluations), [aiEvaluations]);
  const diaryGrades = useQuery(diaryGradesQuery(groupId));
  const myDiary = (diaryGrades.data ?? []).find((d) => d.student_id === me?.id);
  const qc = useQueryClient();
  const project = group?.projects ?? null;

  const [selected, setSelected] = useState<number>(project?.current_phase ?? 1);
  const [draft, setDraft] = useState<Draft | null>(project ? toDraft(project) : null);
  const [pickedIdea, setPickedIdea] = useState<string | null>(null);
  const saved = useMemo(() => (project ? toDraft(project) : null), [project]);

  const changedFields = useMemo(() => {
    if (!draft || !saved) return [];
    return (Object.keys(draft) as (keyof Draft)[]).filter(
      (k) => JSON.stringify(draft[k]) !== JSON.stringify(saved[k]),
    );
  }, [draft, saved]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (project && pickedIdea) {
        const r = await supabase.from("projects").update({ idea_id: pickedIdea }).eq("id", project.id);
        if (r.error) throw r.error;
        setPickedIdea(null);
        qc.invalidateQueries({ queryKey: ["idea-usage"] });
      }
      if (!project || !draft || !saved || changedFields.length === 0) return;
      const patch: Partial<Project> = {};
      for (const k of changedFields) {
        if (k === "scientific_articles") patch.scientific_articles = draft.scientific_articles;
        else if (TABLE_COLUMN_LIST.includes(k as TableColumn)) (patch as Record<string, unknown>)[k] = draft[k as TableColumn];
        else if (CHART_COLUMN_LIST.includes(k as ChartColumn)) (patch as Record<string, unknown>)[k] = draft[k as ChartColumn];
        else { const t = k as TextFieldKey; patch[t] = draft[t].trim() === "" ? null : draft[t]; }
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

  const evaluate = useServerFn(getPhaseEvaluation);
  const submitMutation = useMutation({
    mutationFn: async () => {
      if (changedFields.length) await saveMutation.mutateAsync();
      const { error } = await supabase.rpc("submit_phase", { _project_id: project!.id });
      if (error) throw error;
      // Every delivered written stage gets an AI evaluation for the teacher, even if the group never asked.
      const phase = selected;
      const text = draft ? phaseText(draft, phase).trim() : "";
      if (phase !== BANNER_PHASE && text.length >= 20) {
        evaluate({ data: { projectId: project!.id, phaseNumber: phase, text: text.slice(0, 30000) } })
          .then(() => {
            qc.invalidateQueries({ queryKey: ["ai", "group", groupId] });
            qc.invalidateQueries({ queryKey: ["medals"] });
          })
          .catch((e) => console.warn("Automatic AI evaluation failed", e));
      }
    },
    onSuccess: () => {
      toast.success("Etapa entregue para a professora!");
      const deliveredPhase = selected;
      const classId = group?.classes?.id;
      if (classId)
        qc.fetchQuery({ ...classMedalsQuery(classId), staleTime: 0 })
          .then((d) => {
            const m = d.medals.find((x) => x.groupId === groupId && x.phase === deliveredPhase);
            if (m) toast.success(`${MEDAL_EMOJI[m.kind]} Classificação atual: ${MEDAL_LABEL[m.kind]}!`, { duration: 8000 });
          })
          .catch(() => {});
      qc.invalidateQueries({ queryKey: ["group", groupId] });
      qc.invalidateQueries({ queryKey: ["student"] });
      setSelected((s) => Math.min(PHASE_COUNT, s + 1));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useWrittenRoundsSync(project?.id ?? "", groupId, project?.written_reviews);
  const live = useLiveCollab(groupId, me ? { id: me.id, name: me.name } : null, (k, v) =>
    setDraft((d) => (d && k in d ? { ...d, [k]: v } : d)),
  );

  if (!group || !group.classes || !project || !draft) return null;
  const cls = group.classes;
  const members = group.group_members ?? [];
  const submissions = project.phase_submissions ?? [];
  const lateness = projectLateness({
    currentPhase: project.current_phase,
    schedules: cls.schedules ?? [],
    submissions,
    bannerReviews: project.banner_reviews ?? [],
    writtenReviews: project.written_reviews ?? [],
    perDay: Number(cls.late_penalty_per_day),
  });
  const penalties = bimesterPenalties(lateness.phases);
  const isBanner = selected === BANNER_PHASE;
  const info = lateness.phases[selected - 1] ?? lateness.phases[0]!;
  const isSubmitted = info.state === "delivered";
  // A delivered written stage reopens while the teacher's feedback round awaits the new version.
  const writtenRounds = isWrittenPart(selected) ? stageReviews(project.written_reviews, selected) : [];
  const openReview = isSubmitted ? (writtenRounds.find((r) => !r.resubmitted_at) ?? null) : null;
  // Articles stay editable after delivery so students can fix or add sources while writing.
  const articlesOpen = selected === 2 && isSubmitted && !isBannerDelivered(project);
  const editable = (!isSubmitted && selected <= project.current_phase && info.state !== "skipped") || !!openReview || articlesOpen;
  const phaseDirty = changedFields.some((f) => phaseFields(selected).includes(f));
  const problems = [...phaseFields(selected).flatMap((f) => (TABLE_COLUMN_LIST.includes(f as TableColumn) ? tableProblems(draft[f as TableColumn]) : [])), ...phaseProblems(
    selected,
    isBanner
      ? { banner_canva_url: project.banner_canva_url, banner_file_path: project.banner_file_path, banner_template_url: cls.banner_template_url }
      : {
          ...draft,
          ethics_human_research: project.ethics_human_research,
          ethics_collection: project.ethics_collection,
          ethics_form_url: project.ethics_form_url,
          ethics_form_template_url: cls.ethics_form_template_url,
          ethics_lab: project.ethics_lab,
          ethics_lab_epis: project.ethics_lab_epis,
          ethics_biosafety_declared_at: project.ethics_biosafety_declared_at,
          ethics_population: project.ethics_population,
          ethics_sample_size: project.ethics_sample_size,
          ethics_review_status: project.ethics_review_status,
          diary_video_url: cls.diary_video_url,
          diary_video_watched_at: project.diary_video_watched_at,
          member_names: members.map((m) => m.profiles?.name ?? "").filter(Boolean),
        },
    draft.scientific_articles.length,
  )];
  const grades = [...(group.grades ?? [])].sort((a, b) => a.trimester - b.trimester);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setDraft((d) => (d ? { ...d, [k]: v } : d));
    live.send(k, v);
  };

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

      {live.peers.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span className="size-2 animate-pulse rounded-full bg-primary" />
          <span className="font-medium">Online agora:</span>
          {live.peers.map((p) => (
            <Badge key={p.userId} variant="secondary">
              {p.name.split(" ")[0]}
              {p.field ? " ✍️ digitando" : ""}
            </Badge>
          ))}
        </div>
      )}
      <PhaseTimeline phases={lateness.phases} active={selected} onSelect={setSelected} />
      <GroupResponsibilities groupId={groupId} members={members} editable />

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
            {openReview ? (
              <Badge variant="warning">Nova versão até {fmtDateTime(openReview.resubmit_due_at)}</Badge>
            ) : isSubmitted ? (
              <Badge variant={info.daysLate > 0 ? "warning" : "success"}>Entregue em {fmtDateTime(info.submittedAt)}</Badge>
            ) : !editable ? (
              <Badge variant="muted">
                <Lock className="mr-1 size-3" /> Bloqueada
              </Badge>
            ) : (
              <Badge variant="secondary">Prazo: {fmtDateTime(info.dueDate)}</Badge>
            )}
          </div>

          {isBanner && (
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
          )}
          <StudentWrittenFeedback reviews={writtenRounds} perDay={Number(cls.late_penalty_per_day)} />
          {selected === 1 && editable && (
            <div className="mb-5">
              <IdeaBank groupId={groupId} classId={group!.class_id}
                onUse={(i) => {
                  setPickedIdea(i.id);
                  setDraft((d) =>
                    d ? { ...d, theme: `${i.theme}\n\n${i.summary}`, guiding_question: d.guiding_question?.trim() ? d.guiding_question : i.question } : d,
                  );
                }}
              />
            </div>
          )}
          {selected === 2 && (
            <div className="mb-5">
              <ResearchTutorial theme={draft.theme ?? ""} />
            </div>
          )}
          <fieldset disabled={!editable} className="space-y-5">
            {isBanner ? null : selected === 2 ? (
              <div className="space-y-5">
                <ResearchPromptCard theme={draft.theme ?? ""} />
                <ArticlesEditor members={members.map((m) => m.profiles?.name ?? "").filter(Boolean)} value={draft.scientific_articles} onChange={(v) => set("scientific_articles", v)} editable={editable} />
              </div>
            ) : (
              (PHASE_FORM[selected] ?? []).map((f) => (
                <Field
                  key={f.key}
                  label={f.label}
                  id={f.key}
                  meter={<FieldMeter field={f.key} value={draft[f.key]} />}
                  before={
                    CITATION_FIELDS[f.key] ? (
                      <>
                        <CitationGuide />
                        {f.key === "introduction" && <ArticleCitationPanel articles={draft.scientific_articles} text={draft.introduction} />}
                      </>
                    ) : f.key === "references_list" ? (
                      <>
                        <ReferenceImport articles={draft.scientific_articles} value={draft.references_list} editable={editable} onChange={(v) => set("references_list", v)} />
                        <ReferenceChecklist values={draft} />
                      </>
                    ) : null
                  }
                >
                  {f.rows === 1 ? (
                    <>
                    <Input id={f.key} value={draft[f.key]} placeholder={f.placeholder} readOnly={!!live.editingBy(f.key)} onFocus={() => live.focus(f.key)} onBlur={() => live.focus(null)} onChange={(e) => set(f.key, e.target.value)} />
                    <LiveTag who={live.editingBy(f.key)?.name} />
                    </>
                  ) : (
                    <>
                    <Textarea
                      id={f.key}
                      rows={f.rows}
                      value={draft[f.key]}
                      placeholder={f.placeholder}
                      readOnly={!!live.editingBy(f.key)}
                      className={live.editingBy(f.key) ? "border-secondary ring-2 ring-secondary/40" : undefined}
                      onFocus={() => live.focus(f.key)}
                      onBlur={() => live.focus(null)}
                      onChange={(e) => set(f.key, e.target.value)}
                    />
                    <LiveTag who={live.editingBy(f.key)?.name} />
                    </>
                  )}
                  {(() => { const column = tableColumnOf(f.key); return column ? (
                    <div className="mt-3">
                      <ResultTablesEditor value={draft[column]} onChange={(v) => set(column, v)} editable={editable} label={`Tabelas – ${f.label}`} />
                    </div>
                  ) : null; })()}
                  {(() => { const column = chartColumnOf(f.key); return column ? <StageChartsEditor value={draft[column]} onChange={(v) => set(column, v)} editable={editable} /> : null; })()}
                </Field>
              ))
            )}
          </fieldset>

          {selected === 1 && (
            <div className="mt-5">
              <DiaryVideoStep
                url={cls.diary_video_url}
                projectId={project.id}
                groupId={groupId}
                watchedAt={project.diary_video_watched_at}
                editable={editable}
              />
            </div>
          )}

          {selected === 11 && (
            <div className="mt-5">
              <ReferencesVideoStep url={cls.references_video_url} articleUrl={cls.highlighted_article_url} />
            </div>
          )}

          {selected === 7 && (
            <div className="mt-5">
              <EthicsScreening
                project={project}
                cls={cls}
                groupId={groupId}
                studentId={me!.id}
                students={members.map((m) => m.profiles?.name ?? "").filter(Boolean)}
                editable={editable || project.ethics_review_status === "refazer"}
                delivered={isSubmitted}
              />
            </div>
          )}

          {editable && selected === project.current_phase && !openReview && problems.length > 0 && (
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

          {openReview && (
            <StudentWrittenResubmit
              key={openReview.id}
              review={openReview}
              groupId={groupId}
              currentText={writtenPhaseText(draft, selected)}
              problems={problems}
              onSave={async () => {
                if (changedFields.length) await saveMutation.mutateAsync();
              }}
              onSent={() => {
                // The teacher also gets a fresh AI grade of the corrected text.
                const text = phaseText(draft, selected).trim();
                if (text.length >= 20)
                  evaluate({ data: { projectId: project.id, phaseNumber: selected, text: text.slice(0, 30000) } })
                    .then(() => qc.invalidateQueries({ queryKey: ["ai", "group", groupId] }))
                    .catch((e) => console.warn("AI evaluation of new version failed", e));
              }}
            />
          )}

          {isBanner && (
            <StudentBannerCorrector groupId={groupId} project={project} perDay={Number(cls.late_penalty_per_day)} />
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
          <StudentFairCard groupId={groupId} />
          <DiaryCard groupId={groupId} studentId={me!.id} />
          <ExternalFairsCard
            projectId={project.id}
            groupId={groupId}
            interest={project.external_fairs_interest}
            fairs={project.external_fairs}
          />
          <div className="card-paper p-5">
            <h3 className="mb-3 text-lg font-semibold">Notas</h3>
            <ul className="space-y-3">
              {BIMESTERS.map(({ number: t, title }) => {
                const g = grades.find((x) => x.trimester === t);
                const penalty = penalties[t] ?? 0;
                const diary = t === 3 && myDiary ? Number(myDiary.score) : null;
                const base = bimesterBase(t, g ? Number(g.score) : null, diary);
                const total = base === null ? null : gradeAfterPenalty(base, penalty);
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
                        {t === 3
                          ? `Banner ${formatPoints(Number(g.score))} (60%) + diário ${diary === null ? "aguardando nota" : `${formatPoints(diary)} (40%)`}`
                          : `Nota ${formatPoints(Number(g.score))}`}
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
  const str = (k: string) => (typeof values[k] === "string" ? (values[k] as string) : "");
  const uncited = uncitedReferences(str("references_list"), [str("introduction"), str("results_discussion")]);
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
      {uncited.length > 0 && (
        <div className="mt-3 rounded-md border border-warning/40 bg-warning/10 p-2.5 text-xs">
          <p className="font-medium text-foreground">Referências listadas que não foram citadas no texto ({uncited.length}):</p>
          <ul className="mt-1 list-disc pl-4 text-muted-foreground">{uncited.map((u) => <li key={u}>{u}</li>)}</ul>
          <p className="mt-1 text-muted-foreground">Cite-as na Introdução ou em Resultados, ou remova-as da lista.</p>
        </div>
      )}
    </div>
  );
}

/** Stage-2 articles beside the Introdução: how to cite each and how to use its notes, never ready text. */
function isBannerDelivered(p: { current_phase: number }) {
  return p.current_phase > 13;
}

function ArticleCitationPanel({ articles, text }: { articles: Article[]; text: string }) {
  const list = articles.filter((a) => a.abnt_citation.trim() || a.title.trim());
  const unknown = citationsWithoutArticle(text, list);
  const cited = new Set(uncitedReferences(list.map((a) => a.abnt_citation).join("\n"), [text]));
  return (
    <div className="mb-3 rounded-lg border border-secondary/40 bg-secondary/5 p-4 text-sm">
      <p className="font-semibold text-foreground">Seus artigos cadastrados (Etapa 2)</p>
      <p className="mt-1 text-muted-foreground">
        Use o fichamento para escrever com suas palavras. Modelo de frase: “[ideia do artigo, reescrita por você] + citação”.
        Ex. de estrutura: “Segundo [Autor] ([ano]), [o que o estudo encontrou]. Isso se relaciona ao nosso projeto porque [sua explicação].”
      </p>
      {list.length === 0 ? (
        <p className="mt-3 text-muted-foreground">Nenhum artigo cadastrado na etapa Artigos científicos.</p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {list.map((a, i) => {
            const h = articleCitationHint(a);
            const used = a.abnt_citation.trim() !== "" && !cited.has(a.abnt_citation.trim());
            return (
              <li key={i} className="rounded-md bg-background p-2.5">
                <div className="flex items-start gap-2">
                  {used ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-label="Já citado" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Ainda não citado" />}
                  <span className="font-medium text-foreground">{a.title || a.abnt_citation}</span>
                </div>
                {h ? (
                  <p className="mt-1 font-mono text-xs text-foreground">Cite assim: {h.parenthetical} ou {h.narrative}</p>
                ) : (
                  <p className="mt-1 text-xs text-destructive">Falta o autor ou o ano desta fonte. Volte na Etapa 2 e preencha “Autores” e “Ano”.</p>
                )}
                {(a.findings || a.contribution) && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Ideia para usar (reescreva com suas palavras): {a.findings || a.contribution}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {unknown.length > 0 && (
        <p className="mt-3 text-xs font-medium text-destructive">
          Atenção: {unknown.map((w) => `${w.authors}, ${w.year}`).join("; ")} não corresponde(m) a nenhum artigo cadastrado.
        </p>
      )}
    </div>
  );
}

/** Fills the reference list from the stage-2 articles and warns about listed-but-uncited works. */
function ReferenceImport({ articles, value, editable, onChange }: { articles: Article[]; value: string; editable: boolean; onChange: (v: string) => void }) {
  const pending = importArticleReferences(articles, value).added;
  return (
    <div className="mb-3 rounded-lg border border-secondary/40 bg-secondary/5 p-4 text-sm">
      <p className="font-semibold text-foreground">Importar dos artigos cadastrados</p>
      <p className="mt-1 text-muted-foreground">
        Traz as referências que você digitou na Etapa 2. Revise, ajuste detalhes e adicione outras obras, uma por linha.
      </p>
      <Button type="button" size="sm" variant="secondary" className="mt-3" disabled={!editable || pending === 0}
        onClick={() => { const r = importArticleReferences(articles, value); onChange(r.text); toast.success(`${r.added} referência(s) importada(s)`); }}>
        {pending ? `Importar ${pending} referência(s)` : "Todas já importadas"}
      </Button>
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

const FICHAMENTO = [
  ["objective", "Objetivo / pergunta da pesquisa"],
  ["method", "Metodologia / amostra"],
  ["findings", "Principais resultados"],
  ["contribution", "Contribuição para o nosso projeto"],
] as const;

function ArticlesEditor({
  value,
  onChange,
  editable,
  members,
}: {
  members: string[];
  value: Article[];
  onChange: (v: Article[]) => void;
  editable: boolean;
}) {
  const update = (i: number, patch: Partial<Article>) =>
    onChange(
      value.map((a, j) => {
        if (j !== i) return a;
        const n = { ...a, ...patch };
        const simple = "authors" in patch || "year" in patch || "journal" in patch || "title" in patch || "url" in patch;
        if (simple && (n.authors?.trim() || n.year?.trim())) n.abnt_citation = buildAbntReference(n);
        if ("url" in patch) n.doi_verified = false;
        return n;
      }),
    );
  const [checking, setChecking] = useState<number | null>(null);
  const tried = useRef(new Set<string>());
  useEffect(() => {
    if (!editable) return;
    const i = value.findIndex((a) => {
      const d = extractDoi(a.url ?? "");
      return d && !a.doi_verified && !tried.current.has(d.toLowerCase());
    });
    if (i < 0 || checking !== null) return;
    const t = setTimeout(() => {
      tried.current.add(extractDoi(value[i]!.url ?? "")!.toLowerCase());
      void checkDoi(i);
    }, 800);
    return () => clearTimeout(t);
  });
  const checkDoi = async (i: number) => {
    const doi = extractDoi(value[i]?.url ?? "");
    if (!doi) return;
    setChecking(i);
    try {
      const w = await lookupDoi(doi);
      if (!w) return void toast.error("Esse DOI não existe na base mundial de artigos. Confira o link.");
      const cur = value[i]!;
      const n: Article = { ...cur, title: w.title || cur.title, authors: w.authors || (cur.authors ?? ""), year: w.year || (cur.year ?? ""), journal: w.journal || (cur.journal ?? ""), url: `https://doi.org/${w.doi}`, doi_verified: true };
      n.abnt_citation = buildAbntReference(n);
      onChange(value.map((a, j) => (j === i ? n : a)));
      toast.success("Artigo encontrado e verificado!");
    } catch {
      toast.error("Não foi possível consultar a base agora. Tente de novo.");
    } finally {
      setChecking(null);
    }
  };
  return (
    <div className="space-y-4">
      <p className="rounded-md bg-accent/20 px-3 py-2 text-xs text-foreground">
        🔒 O sistema confere se as fontes são reais: título completo, autores com nome e sobrenome (nunca alguém do grupo), ano de {MIN_YEAR} até hoje e link https://. Todo link com DOI é conferido sozinho na base mundial de artigos; DOI inexistente bloqueia a entrega.
      </p>
      <p
        className={`rounded-md px-3 py-2 text-sm font-medium ${value.length >= 5 ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}
      >
        Fontes cadastradas: {value.length} de no mínimo 5
        {value.length < 5 && " — a entrega fica bloqueada até completar."}
      </p>
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
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input placeholder="Link ou DOI (https://...)" value={a.url} onChange={(e) => update(i, { url: e.target.value })} aria-label="Link" />
            {editable && extractDoi(a.url) && !a.doi_verified && (
              <Button type="button" variant="secondary" disabled={checking === i} onClick={() => checkDoi(i)}>
                {checking === i ? "Verificando…" : "Verificar de novo"}
              </Button>
            )}
          </div>
          {a.doi_verified && <p className="text-xs font-medium text-success">✔ Encontrado na base mundial de artigos (Crossref): dados preenchidos automaticamente.</p>}
          {(() => {
            const pr = articleProblems(a, members);
            return pr.length > 0 && (a.title || a.url || a.authors) ? (
              <ul className="list-disc rounded-md bg-destructive/10 py-2 pl-6 pr-3 text-xs text-destructive">
                {pr.map((m) => <li key={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</li>)}
              </ul>
            ) : null;
          })()}
          <div className="grid gap-3 sm:grid-cols-[1fr_110px]">
            <Input placeholder="Autores (ex.: Mariana Silva e Carlos Souza)" value={a.authors ?? ""} onChange={(e) => update(i, { authors: e.target.value })} aria-label="Autores" />
            <Input inputMode="numeric" maxLength={4} placeholder="Ano" value={a.year ?? ""} onChange={(e) => update(i, { year: e.target.value.replace(/\D/g, "") })} aria-label="Ano" />
          </div>
          <Input placeholder="Revista ou site onde foi publicado (opcional)" value={a.journal ?? ""} onChange={(e) => update(i, { journal: e.target.value })} aria-label="Revista ou site" />
          {(() => {
            const h = articleCitationHint(a);
            return h ? (
              <div className="rounded-md bg-success/10 p-2.5 text-sm">
                <p className="font-medium text-foreground">✅ Como citar no seu texto: <span className="font-mono">{h.parenthetical}</span> ou <span className="font-mono">{h.narrative}</span></p>
                {a.abnt_citation && <p className="mt-1 text-xs text-muted-foreground">Referência ABNT montada: {a.abnt_citation}</p>}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Preencha autores e ano: o app monta a ABNT para você.</p>
            );
          })()}
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">Já tenho a referência pronta (colar do Google Acadêmico)</summary>
            <Textarea
              rows={2}
              className="mt-2"
              placeholder="Cole aqui a referência. Pode ser com letras maiúsculas ou minúsculas."
              value={a.abnt_citation}
              onChange={(e) => update(i, { abnt_citation: e.target.value })}
              aria-label="Citação ABNT"
            />
          </details>
          <div className="grid gap-3 sm:grid-cols-2">
            {FICHAMENTO.map(([k, label]) => (
              <Textarea
                key={k}
                rows={2}
                placeholder={label}
                aria-label={label}
                value={a[k] ?? ""}
                onChange={(e) => update(i, { [k]: e.target.value })}
              />
            ))}
          </div>
        </div>
      ))}
      {editable && (
        <Button
          type="button"
          variant="outline"
          onClick={() => onChange([...value, { title: "", url: "", source_type: SOURCE_TYPES[0], abnt_citation: "", authors: "", year: "", journal: "" }])}
        >
          <Plus /> Adicionar fonte
        </Button>
      )}
    </div>
  );
}

function LiveTag({ who }: { who?: string | undefined }) {
  if (!who) return null;
  return (
    <p className="mt-1 flex items-center gap-1 text-xs font-medium text-secondary">
      <span className="size-1.5 animate-pulse rounded-full bg-secondary" />
      {who.split(" ")[0]} está editando este campo — aguarde para escrever.
    </p>
  );
}
