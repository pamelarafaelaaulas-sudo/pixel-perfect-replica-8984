import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, MessageCircle, RotateCcw, Star, UserMinus, Award, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { PhaseTimeline } from "@/components/phase-timeline";
import { ProjectView } from "@/components/project-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { aiEvaluationsForGroupQuery, groupDetailQuery, peerEvaluationsForGroupQuery } from "@/lib/queries";
import { BIMESTERS, PHASES, SECTION_LABELS, bimesterMeta } from "@/lib/phases";
import { fmtAgo, fmtDateTime, whatsappLink } from "@/lib/format";
import { bimesterPenalties, formatPoints, gradeAfterPenalty, projectLateness } from "@/lib/penalty";
import { latestPerPhase, overallScore, type SavedAiEvaluation } from "@/lib/ai-score";
import { AiEvaluationView, scoreTone } from "@/components/ai-feedback";

export const Route = createFileRoute("/_authenticated/professora/grupo/$groupId")({
  head: () => ({
    meta: [
      { title: "Grupo — Caderno de Projetos" },
      { name: "description", content: "Projeto, contribuições, avaliações e notas do grupo." },
      { property: "og:title", content: "Grupo — Caderno de Projetos" },
      { property: "og:description", content: "Projeto, contribuições, avaliações e notas do grupo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async ({ context, params }) => {
    const [g] = await Promise.all([
      context.queryClient.ensureQueryData(groupDetailQuery(params.groupId)),
      context.queryClient.ensureQueryData(peerEvaluationsForGroupQuery(params.groupId)),
      context.queryClient.ensureQueryData(aiEvaluationsForGroupQuery(params.groupId)),
    ]);
    if (!g) throw notFound();
  },
  component: TeacherGroupPage,
});

function TeacherGroupPage() {
  const { groupId } = Route.useParams();
  const { data: group } = useSuspenseQuery(groupDetailQuery(groupId));
  const { data: peers } = useSuspenseQuery(peerEvaluationsForGroupQuery(groupId));
  const { data: aiEvaluations } = useSuspenseQuery(aiEvaluationsForGroupQuery(groupId));
  const aiByPhase = latestPerPhase(aiEvaluations);
  const aiLatest = Object.values(aiByPhase).map((x) => x.latest.overall);
  const aiAverage = aiLatest.length ? overallScore(aiLatest) : null;
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["group", groupId] });
    qc.invalidateQueries({ queryKey: ["teacher", "student"] });
    qc.invalidateQueries({ queryKey: ["teacher", "bimester"] });
    if (group?.classes) qc.invalidateQueries({ queryKey: ["class", group.classes.id] });
  };

  const reopen = useMutation({
    mutationFn: async (phase: number) => {
      const project = group!.projects!;
      const del = await supabase
        .from("phase_submissions")
        .delete()
        .eq("project_id", project.id)
        .gte("phase_number", phase);
      if (del.error) throw del.error;
      const up = await supabase.from("projects").update({ current_phase: phase }).eq("id", project.id);
      if (up.error) throw up.error;
    },
    onSuccess: () => {
      toast.success("Etapa reaberta para o grupo");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.from("group_members").delete().eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Aluno removido do grupo");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [reopenPhase, setReopenPhase] = useState("1");

  if (!group || !group.classes) return null;
  const cls = group.classes;
  const project = group.projects;
  const members = group.group_members ?? [];
  const nameOf = (id: string) => members.find((m) => m.student_id === id)?.profiles?.name ?? "Ex-integrante";
  const perDay = Number(cls.late_penalty_per_day);
  const lateness = projectLateness({
    currentPhase: project?.current_phase ?? 1,
    schedules: cls.schedules ?? [],
    submissions: project?.phase_submissions ?? [],
    perDay,
  });
  const penalties = bimesterPenalties(lateness.phases);

  return (
    <>
      <Link
        to="/professora/turma/$classId"
        params={{ classId: cls.id }}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {cls.name}
      </Link>
      <PageHeader
        eyebrow={`Grupo · ${cls.name}`}
        title={group.group_name}
        description={project ? `Última edição ${fmtAgo(project.updated_at)}` : undefined}
      />

      <section className="mb-6 grid gap-3 sm:grid-cols-3">
        {members.map((m) => (
          <div key={m.id} className="card-paper flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <Link
                to="/professora/aluno/$studentId"
                params={{ studentId: m.student_id }}
                className="block truncate font-medium hover:text-primary hover:underline"
                title="Ver revisão do aluno"
              >
                {m.profiles?.name}
              </Link>
              <a
                href={whatsappLink(m.whatsapp)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <MessageCircle className="size-3.5" /> {m.whatsapp}
              </a>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={`Remover ${m.profiles?.name}`}>
                  <UserMinus />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remover {m.profiles?.name} do grupo?</AlertDialogTitle>
                  <AlertDialogDescription>O aluno poderá entrar em outro grupo da turma.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => removeMember.mutate(m.id)}>Remover</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ))}
      </section>

      <section className="mb-8">
        <PhaseTimeline phases={lateness.phases} />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Desconto acumulado por atraso:{" "}
            <strong className={lateness.totalPenalty > 0 ? "text-destructive" : "text-foreground"}>
              {formatPoints(lateness.totalPenalty)} ponto(s)
            </strong>{" "}
            ({formatPoints(perDay)} por dia
            {lateness.totalPenalty > 0 &&
              ` · ${BIMESTERS.filter((b) => (penalties[b.number] ?? 0) > 0)
                .map((b) => `${b.number}º bim. −${formatPoints(penalties[b.number] ?? 0)}`)
                .join(", ")}`}
            )
          </p>
          {project && (
            <div className="flex items-center gap-2">
              <Select value={reopenPhase} onValueChange={setReopenPhase}>
                <SelectTrigger className="w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PHASES.map((p) => (
                    <SelectItem key={p.number} value={String(p.number)}>
                      Etapa {p.number} · {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => reopen.mutate(Number(reopenPhase))} disabled={reopen.isPending}>
                <RotateCcw /> Reabrir etapa
              </Button>
            </div>
          )}
        </div>
      </section>

      <Tabs defaultValue="projeto">
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="projeto">Projeto</TabsTrigger>
          <TabsTrigger value="contrib">Quem escreveu</TabsTrigger>
          <TabsTrigger value="pares">Avaliação dos colegas</TabsTrigger>
          <TabsTrigger value="notas">Notas</TabsTrigger>
          <TabsTrigger value="ia">Avaliação da IA</TabsTrigger>
        </TabsList>

        <TabsContent value="projeto" className="card-paper p-6 md:p-8">
          {project ? <ProjectView project={project} /> : <p>Sem projeto.</p>}
        </TabsContent>

        <TabsContent value="contrib" className="card-paper p-6">
          <Contributions
            contributions={project?.project_contributions ?? []}
            members={members.map((m) => ({ id: m.student_id, name: m.profiles?.name ?? "" }))}
            nameOf={nameOf}
          />
        </TabsContent>

        <TabsContent value="pares" className="card-paper p-6">
          <p className="mb-4 text-sm text-muted-foreground">
            Confidencial: os alunos só veem as avaliações que eles mesmos fizeram.
          </p>
          {BIMESTERS.map(({ number: t }) => {
            const rows = peers.filter((p) => p.trimester === t);
            return (
              <div key={t} className="mb-6 last:mb-0">
                <h3 className="mb-2 text-lg font-semibold">{t}º bimestre</h3>
                {rows.length === 0 ? (
                  <p className="text-sm italic text-muted-foreground">Nenhuma avaliação.</p>
                ) : (
                  <ul className="space-y-2">
                    {rows.map((r) => (
                      <li key={r.id} className="rounded-lg border border-border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm">
                            <strong>{nameOf(r.evaluator_student_id)}</strong> avaliou{" "}
                            <strong>{nameOf(r.evaluated_student_id)}</strong>
                          </p>
                          <Stars value={Number(r.score)} />
                        </div>
                        {r.feedback && <p className="mt-2 text-sm text-muted-foreground">“{r.feedback}”</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="notas">
          {aiAverage !== null && (
            <p className="mb-4 text-sm text-muted-foreground">
              Para comparar: a média da IA nas etapas avaliadas é{" "}
              <strong className={scoreTone(aiAverage)}>{formatPoints(aiAverage)}</strong> (detalhes na aba Avaliação da
              IA).
            </p>
          )}
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {BIMESTERS.map(({ number: t }) => (
              <GradeForm
                key={t}
                groupId={groupId}
                bimester={t}
                existing={(group.grades ?? []).find((g) => g.trimester === t)}
                penalty={penalties[t] ?? 0}
                onSaved={invalidate}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="ia">
          <AiTab
            byPhase={aiByPhase}
            history={aiEvaluations}
            aiAverage={aiAverage}
            grades={group.grades ?? []}
            nameOf={nameOf}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${value} de 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={i <= value ? "size-4 fill-highlight text-highlight" : "size-4 text-border"} />
      ))}
    </span>
  );
}

function Contributions({
  contributions,
  members,
  nameOf,
}: {
  contributions: { student_id: string; section_name: string; char_count_added: number; edited_at: string }[];
  members: { id: string; name: string }[];
  nameOf: (id: string) => string;
}) {
  const ids = Array.from(new Set([...members.map((m) => m.id), ...contributions.map((c) => c.student_id)]));
  const total = contributions.reduce((s, c) => s + c.char_count_added, 0) || 1;
  const sections = Array.from(new Set(contributions.map((c) => c.section_name)));

  if (contributions.length === 0)
    return <p className="text-sm italic text-muted-foreground">Ninguém editou o projeto ainda.</p>;

  return (
    <div className="space-y-6">
      {ids.map((id) => {
        const mine = contributions.filter((c) => c.student_id === id);
        const chars = mine.reduce((s, c) => s + c.char_count_added, 0);
        const last = mine.reduce<string | null>((l, c) => (!l || c.edited_at > l ? c.edited_at : l), null);
        const pct = Math.round((chars / total) * 100);
        return (
          <div key={id}>
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium">{nameOf(id)}</p>
              <p className="text-sm text-muted-foreground">
                {chars.toLocaleString("pt-BR")} caracteres · {mine.length} edição(ões) · {pct}%
                {last && ` · última ${fmtAgo(last)}`}
              </p>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {sections.map((s) => {
                const n = mine.filter((c) => c.section_name === s).reduce((a, c) => a + c.char_count_added, 0);
                if (!n) return null;
                return (
                  <Badge key={s} variant="muted">
                    {SECTION_LABELS[s] ?? s}: {n.toLocaleString("pt-BR")}
                  </Badge>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GradeForm({
  groupId,
  bimester,
  existing,
  penalty,
  onSaved,
}: {
  groupId: string;
  bimester: number;
  existing?: { score: number; feedback: string | null; is_reference_ten: boolean; created_at: string } | undefined;
  penalty: number;
  onSaved: () => void;
}) {
  const [score, setScore] = useState(existing ? formatPoints(Number(existing.score)) : "");
  const [feedback, setFeedback] = useState(existing?.feedback ?? "");
  const [reference, setReference] = useState(existing?.is_reference_ten ?? false);
  const numeric = Number(score.replace(",", "."));
  const valid = score !== "" && !Number.isNaN(numeric) && numeric >= 0 && numeric <= 10;

  const save = useMutation({
    mutationFn: async () => {
      if (!valid) throw new Error("A nota deve ser de 0 a 10");
      const { error } = await supabase.from("grades").upsert(
        { group_id: groupId, trimester: bimester, score: numeric, feedback: feedback || null, is_reference_ten: reference },
        { onConflict: "group_id,trimester" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Nota do ${bimester}º bimestre salva`);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="card-paper space-y-4 p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">{bimester}º bimestre</h3>
          <p className="text-xs text-muted-foreground">{bimesterMeta(bimester).title}</p>
        </div>
        {existing && <Badge variant="success">Lançada</Badge>}
      </div>
      {bimester === 4 && (
        <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
          Nota da feira. Os detalhes da feira ainda serão adicionados; por enquanto, lance só a nota.
        </p>
      )}
      <div className="space-y-2">
        <Label htmlFor={`score-${bimester}`}>Nota (0 a 10)</Label>
        <Input
          id={`score-${bimester}`}
          inputMode="decimal"
          value={score}
          onChange={(e) => setScore(e.target.value)}
          placeholder="Ex.: 8,5"
        />
        {valid && penalty > 0 && (
          <p className="text-xs text-muted-foreground">
            Com o desconto de atraso deste bimestre ({formatPoints(penalty)}): <strong>{formatPoints(gradeAfterPenalty(numeric, penalty))}</strong>
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor={`fb-${bimester}`}>Comentário para o grupo</Label>
        <Textarea id={`fb-${bimester}`} rows={4} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
      </div>
      <label className="flex items-center justify-between gap-3 rounded-lg bg-muted p-3 text-sm">
        <span className="inline-flex items-center gap-2">
          <Award className="size-4 text-primary" /> Trabalho referência (nota 10)
        </span>
        <Switch checked={reference} onCheckedChange={setReference} />
      </label>
      <Button className="w-full" onClick={() => save.mutate()} disabled={save.isPending || !valid}>
        Salvar nota
      </Button>
      {existing && <p className="text-center text-xs text-muted-foreground">Lançada em {fmtDateTime(existing.created_at)}</p>}
    </div>
  );
}

function AiTab({
  byPhase,
  history,
  aiAverage,
  grades,
  nameOf,
}: {
  byPhase: Record<number, { latest: SavedAiEvaluation; count: number }>;
  history: SavedAiEvaluation[];
  aiAverage: number | null;
  grades: { trimester: number; score: number }[];
  nameOf: (id: string) => string;
}) {
  return (
    <div className="space-y-5">
      <section className="card-paper flex flex-wrap items-center gap-6 p-5">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Média da IA (etapas avaliadas)</p>
          <p className={`font-mono text-3xl font-semibold ${aiAverage === null ? "text-muted-foreground" : scoreTone(aiAverage)}`}>
            {aiAverage === null ? "—" : formatPoints(aiAverage)}
          </p>
        </div>
        <div className="h-10 w-px bg-border" />
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Suas notas</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {BIMESTERS.map(({ number: t }) => {
              const g = grades.find((x) => x.trimester === t);
              return (
                <span key={t} className="rounded-md border border-border px-2 py-1 font-mono text-sm">
                  {t}º bim.: <strong>{g ? formatPoints(Number(g.score)) : "—"}</strong>
                </span>
              );
            })}
          </div>
        </div>
        <p className="basis-full text-xs text-muted-foreground">
          A nota da IA é só uma referência pedida pelos alunos; ela não entra na nota final.
        </p>
      </section>

      {PHASES.map((p) => {
        const entry = byPhase[p.number];
        const older = history.filter((h) => h.phaseNumber === p.number && h.id !== entry?.latest.id);
        return (
          <section key={p.number} className="card-paper p-6">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-lg font-semibold">
                <span className="font-mono text-xs text-muted-foreground">ETAPA {p.number}</span> {p.name}
              </h3>
              {entry && (
                <p className="text-xs text-muted-foreground">
                  {fmtDateTime(entry.latest.createdAt)}
                  {entry.latest.requestedBy && ` · pedida por ${nameOf(entry.latest.requestedBy)}`}
                  {entry.count > 1 && ` · ${entry.count} avaliações`}
                </p>
              )}
            </div>
            {!entry ? (
              <p className="flex items-center gap-2 text-sm italic text-muted-foreground">
                <Sparkles className="size-4" /> O grupo ainda não pediu avaliação da IA nesta etapa.
              </p>
            ) : (
              <>
                <AiEvaluationView evaluation={entry.latest} />
                <details className="mt-5 rounded-lg border border-border p-3 text-sm">
                  <summary className="cursor-pointer font-medium">Texto que a IA avaliou</summary>
                  <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{entry.latest.evaluatedText}</p>
                </details>
                {older.length > 0 && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Avaliações anteriores:{" "}
                    {older.map((o) => `${formatPoints(o.overall)} (${fmtDateTime(o.createdAt)})`).join(" · ")}
                  </p>
                )}
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
