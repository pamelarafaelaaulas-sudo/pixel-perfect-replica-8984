import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, GitCompare, Loader2, PenLine, Plus, RefreshCw, Send, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { compareWrittenVersions } from "@/lib/written-review.functions";
import { writtenComparisonsQuery, writtenRoundsQuery } from "@/lib/queries";
import {
  WRITTEN_REVIEW_DAYS,
  lineDiff,
  responseProblem,
  sameTextProblem,
  stageBimester,
  writtenPhaseText,
} from "@/lib/written-review";
import { PHASES, WRITTEN_END, WRITTEN_START, phaseMeta } from "@/lib/phases";
import { daysLate, formatPoints, phasePenalty } from "@/lib/penalty";
import { fmtDateTime } from "@/lib/format";
import { scoreTone } from "@/components/ai-feedback";

export type WrittenReview = Database["public"]["Tables"]["written_reviews"]["Row"];
type Comparison = Database["public"]["Tables"]["written_comparisons"]["Row"];
type Project = Database["public"]["Tables"]["projects"]["Row"] & {
  written_reviews?: WrittenReview[] | null;
  phase_submissions?: { phase_number: number; submitted_at: string }[] | null;
};

const byRoundDesc = (a: WrittenReview, b: WrittenReview) => b.round - a.round;

export function stageReviews(reviews: WrittenReview[] | null | undefined, phase: number) {
  return (reviews ?? []).filter((r) => r.phase_number === phase).sort(byRoundDesc);
}

function lateText(days: number, penalty: number, phase: number) {
  if (days <= 0) return "Enviada dentro do prazo, sem desconto.";
  return `Enviada com ${days} dia(s) de atraso: −${formatPoints(penalty)} ponto(s) no ${stageBimester(phase)}º bimestre.`;
}

function RoundStatus({ review, perDay }: { review: WrittenReview; perDay: number }) {
  const days = daysLate(review.resubmit_due_at, review.resubmitted_at);
  const penalty = phasePenalty(days, perDay);
  if (review.resubmitted_at)
    return (
      <p className={days > 0 ? "text-sm text-destructive" : "text-sm text-success"}>
        Nova versão em {fmtDateTime(review.resubmitted_at)}. {lateText(days, penalty, review.phase_number)}
      </p>
    );
  return (
    <p className={days > 0 ? "text-sm font-medium text-destructive" : "text-sm text-muted-foreground"}>
      {days > 0
        ? `O prazo passou há ${days} dia(s): desconto de ${formatPoints(penalty)} ponto(s) até agora (${formatPoints(perDay)} por dia).`
        : `Aguardando a nova versão até ${fmtDateTime(review.resubmit_due_at)}. Depois disso, desconta ${formatPoints(perDay)} ponto por dia.`}
    </p>
  );
}

function ReviewCard({ review, perDay, children }: { review: WrittenReview; perDay: number; children?: React.ReactNode }) {
  return (
    <li className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-foreground">
          Devolutiva da versão {review.round} → versão {review.round + 1}
        </p>
        <Badge variant={review.resubmitted_at ? "success" : "warning"}>
          <CalendarClock className="mr-1 size-3" /> Prazo: {fmtDateTime(review.resubmit_due_at)}
        </Badge>
      </div>
      {review.notes && <p className="whitespace-pre-wrap text-sm text-foreground">{review.notes}</p>}
      {review.student_response && (
        <div className="rounded-md border border-secondary/40 bg-secondary/10 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Resposta do grupo</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{review.student_response}</p>
        </div>
      )}
      <RoundStatus review={review} perDay={perDay} />
      {children}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Student                                                             */
/* ------------------------------------------------------------------ */

/** Refreshes the group page when the teacher sends or edits written-stage feedback (no reload needed). */
export function useWrittenRoundsSync(projectId: string, groupId: string, reviews: WrittenReview[] | null | undefined) {
  const qc = useQueryClient();
  const rounds = useQuery(writtenRoundsQuery(projectId));
  const known = (reviews ?? [])
    .map((r) => `${r.id}:${r.resubmitted_at ?? ""}:${r.updated_at}`)
    .sort()
    .join("|");
  useEffect(() => {
    if (rounds.data !== undefined && rounds.data !== known) qc.invalidateQueries({ queryKey: ["group", groupId] });
  }, [rounds.data, known, qc, groupId]);
}

/** Student: the teacher's feedback rounds for this stage, shown above the text. */
export function StudentWrittenFeedback({ reviews, perDay }: { reviews: WrittenReview[]; perDay: number }) {
  if (reviews.length === 0) return null;
  const open = reviews.find((r) => !r.resubmitted_at);
  return (
    <section className="mb-6 space-y-3">
      <h3 className="flex items-center gap-2 text-lg font-semibold">
        <PenLine className="size-5 text-primary" /> Devolutiva da professora
      </h3>
      {open && (
        <p className="text-sm text-muted-foreground">
          A etapa foi reaberta para correção. Corrijam o texto abaixo e, no fim da página, contem o que mudaram e enviem a versão{" "}
          {open.round + 1}.
        </p>
      )}
      <ul className="space-y-3">
        {reviews.map((r) => (
          <ReviewCard key={r.id} review={r} perDay={perDay} />
        ))}
      </ul>
    </section>
  );
}

/** Student: mandatory answer + send the corrected text as the new version. */
export function StudentWrittenResubmit({
  review,
  currentText,
  problems,
  onSave,
  onSent,
  groupId,
}: {
  review: WrittenReview;
  /** Stage text as it is in the editor now (saved before sending). */
  currentText: string;
  /** Delivery rules still apply to the new version (word limits, citations…). */
  problems: string[];
  onSave: () => Promise<void>;
  onSent?: () => void;
  groupId: string;
}) {
  const qc = useQueryClient();
  const compare = useServerFn(compareWrittenVersions);
  const [response, setResponse] = useState("");
  const answerProblem = responseProblem(response);
  const identical = sameTextProblem(review.reviewed_text, currentText);
  const next = review.round + 1;

  const send = useMutation({
    mutationFn: async () => {
      if (answerProblem) throw new Error(answerProblem);
      if (identical) throw new Error(identical);
      await onSave();
      const { data: at, error } = await supabase.rpc("resubmit_written", { _review_id: review.id, _response: response.trim() });
      if (error) throw error;
      return at;
    },
    onSuccess: (at) => {
      const days = daysLate(review.resubmit_due_at, at ?? new Date().toISOString());
      toast.success(`Versão ${next} enviada em ${fmtDateTime(at)}. ${days > 0 ? `Atraso de ${days} dia(s).` : "Dentro do prazo."}`);
      setResponse("");
      qc.invalidateQueries({ queryKey: ["group", groupId] });
      compare({ data: { reviewId: review.id } }).catch((e) => console.warn("Written comparison failed", e));
      onSent?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const blocked = !!answerProblem || !!identical || problems.length > 0;
  return (
    <div className="mt-6 space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-4">
      <p className="font-medium text-foreground">Responder à devolutiva e enviar a versão {next}</p>
      <div className="space-y-2">
        <Label htmlFor={`wresponse-${review.id}`}>O que vocês mudaram nesta versão? (obrigatório)</Label>
        <Textarea
          id={`wresponse-${review.id}`}
          rows={4}
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          placeholder="Ex.: Reescrevemos o 2º parágrafo, incluímos a citação (Silva, 2023) e cortamos o texto para 480 palavras."
        />
        {answerProblem && response.length > 0 && <p className="text-xs text-destructive">{answerProblem}</p>}
      </div>
      {identical && <p className="text-sm text-warning-foreground">{identical}</p>}
      {problems.length > 0 && (
        <ul className="ml-5 list-disc text-sm text-muted-foreground">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <Button type="button" onClick={() => send.mutate()} disabled={blocked || send.isPending}>
        {send.isPending ? <Loader2 className="animate-spin" /> : <Send />} Enviar versão {next}
      </Button>
      <p className="text-xs text-muted-foreground">
        O PamLab registra a data e a hora do envio. Se o texto for idêntico ao anterior, o envio é recusado. A professora recebe a sua
        resposta e uma comparação entre as duas versões.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Teacher                                                             */
/* ------------------------------------------------------------------ */

const defaultDue = () => {
  const d = new Date(Date.now() + WRITTEN_REVIEW_DAYS * 24 * 60 * 60 * 1000);
  d.setHours(23, 59, 0, 0);
  return format(d, "yyyy-MM-dd'T'HH:mm");
};

function ReviewForm({
  groupId,
  projectId,
  phase,
  existing,
  onDone,
}: {
  groupId: string;
  projectId: string;
  phase: number;
  existing: WrittenReview | null;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [due, setDue] = useState(existing ? format(new Date(existing.resubmit_due_at), "yyyy-MM-dd'T'HH:mm") : defaultDue());
  const save = useMutation({
    mutationFn: async () => {
      const dueAt = new Date(due);
      if (Number.isNaN(dueAt.getTime())) throw new Error("Escolha a data e a hora limite da nova versão.");
      if (!notes.trim()) throw new Error("Escreva as observações para o grupo.");
      const fields = { notes: notes.trim(), resubmit_due_at: dueAt.toISOString() };
      const { error } = existing
        ? await supabase.from("written_reviews").update(fields).eq("id", existing.id)
        : await supabase.from("written_reviews").insert({ ...fields, project_id: projectId, group_id: groupId, phase_number: phase });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(existing ? "Devolutiva atualizada" : "Devolutiva enviada ao grupo");
      qc.invalidateQueries({ queryKey: ["group", groupId] });
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const id = existing?.id ?? `new-${phase}`;
  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/40 p-4">
      <div className="space-y-2">
        <Label htmlFor={`wnotes-${id}`}>Observações para o grupo</Label>
        <Textarea
          id={`wnotes-${id}`}
          rows={5}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ex.: Falta a hipótese, incluam mais duas citações de autores diferentes e revisem o tamanho (até 500 palavras)…"
        />
      </div>
      <div className="max-w-xs space-y-2">
        <Label htmlFor={`wdue-${id}`}>Data e hora limite da nova versão</Label>
        <Input id={`wdue-${id}`} type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        {!existing && <p className="text-xs text-muted-foreground">Já vem com {WRITTEN_REVIEW_DAYS} dias a partir de hoje.</p>}
      </div>
      <Button onClick={() => save.mutate()} disabled={save.isPending}>
        {save.isPending ? <Loader2 className="animate-spin" /> : <Send />} {existing ? "Salvar devolutiva" : "Enviar devolutiva ao grupo"}
      </Button>
    </div>
  );
}

const asList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : []);

function ComparisonList({ title, items, tone }: { title: string; items: string[]; tone: "neutral" | "success" | "warning" }) {
  if (items.length === 0) return null;
  const style = tone === "success" ? "border-success/40 bg-success/10" : tone === "warning" ? "border-warning/50 bg-warning/10" : "border-border bg-muted/40";
  return (
    <div className={`rounded-md border p-3 ${style}`}>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-foreground">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

/** Side-by-side of the two texts, with the lines that changed highlighted. */
function TextDiff({ review }: { review: WrittenReview }) {
  const after = review.resubmitted_text ?? "";
  const diff = useMemo(() => lineDiff(review.reviewed_text, after), [review.reviewed_text, after]);
  const removed = new Set(diff.removed);
  const added = new Set(diff.added);
  const render = (text: string, marked: Set<string>, tone: string) =>
    text
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l, i) => (
        <p key={i} className={cn("rounded px-1.5 py-0.5 text-sm", marked.has(l) && tone)}>
          {l}
        </p>
      ));
  return (
    <details className="rounded-md border border-border">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-foreground">
        Ver os dois textos lado a lado ({diff.removed.length} trecho(s) saíram, {diff.added.length} entraram)
      </summary>
      <div className="grid gap-3 border-t border-border p-3 md:grid-cols-2">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Versão {review.round}</p>
          {render(review.reviewed_text, removed, "bg-destructive/10 line-through decoration-destructive/50")}
        </div>
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Versão {review.round + 1}</p>
          {render(after, added, "bg-success/15")}
        </div>
      </div>
    </details>
  );
}

function ComparisonBlock({ groupId, review, comparison }: { groupId: string; review: WrittenReview; comparison: Comparison | undefined }) {
  const qc = useQueryClient();
  const fn = useServerFn(compareWrittenVersions);
  const run = useMutation({
    mutationFn: () => fn({ data: { reviewId: review.id } }),
    onSuccess: () => {
      toast.success("Comparação pronta");
      qc.invalidateQueries({ queryKey: ["written", "comparisons", groupId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const score = comparison ? Number(comparison.improvement_score) : null;
  return (
    <div className="space-y-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-medium text-foreground">
          <GitCompare className="size-4 text-primary" /> Comparação da IA: versão {review.round} × versão {review.round + 1}
        </p>
        <Button size="sm" variant="secondary" onClick={() => run.mutate()} disabled={run.isPending}>
          {run.isPending ? <Loader2 className="animate-spin" /> : comparison ? <RefreshCw /> : <Sparkles />}{" "}
          {comparison ? "Refazer comparação" : "Comparar as versões"}
        </Button>
      </div>
      <TextDiff review={review} />
      {run.isPending && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> A IA está lendo as duas versões…
        </p>
      )}
      {comparison && score !== null ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted-foreground">
              Nota de melhoria: <strong className={cn("font-display text-xl", scoreTone(score))}>{formatPoints(score)}</strong> / 10
            </span>
            <Badge variant={comparison.change_percent < 10 ? "destructive" : "secondary"}>Mudou cerca de {comparison.change_percent}%</Badge>
            {comparison.response_matches === false && <Badge variant="warning">A resposta do grupo não bate com o texto</Badge>}
            {comparison.response_matches === true && <Badge variant="success">A resposta do grupo bate com o texto</Badge>}
            <span className="text-xs text-muted-foreground">{fmtDateTime(comparison.created_at)}</span>
          </div>
          {comparison.summary && <p className="text-sm text-foreground">{comparison.summary}</p>}
          <ComparisonList title="O que mudou" items={asList(comparison.changed)} tone="neutral" />
          <ComparisonList title="O que foi atendido da sua devolutiva" items={asList(comparison.addressed)} tone="success" />
          <ComparisonList title="O que ainda precisa de atenção" items={asList(comparison.pending)} tone="warning" />
          {comparison.response_note && <p className="text-sm italic text-muted-foreground">{comparison.response_note}</p>}
          <p className="text-xs text-muted-foreground">Só você vê a nota de melhoria. Os alunos não veem a comparação.</p>
        </div>
      ) : (
        !run.isPending && (
          <p className="text-sm italic text-muted-foreground">
            Ainda sem comparação. Ela é feita sozinha quando o grupo envia a nova versão; se não aparecer, clique em "Comparar as versões".
          </p>
        )
      )}
    </div>
  );
}

function StagePanel({
  groupId,
  project,
  phase,
  perDay,
  comparisons,
}: {
  groupId: string;
  project: Project;
  phase: number;
  perDay: number;
  comparisons: Comparison[];
}) {
  const qc = useQueryClient();
  const reviews = stageReviews(project.written_reviews, phase);
  const open = reviews.find((r) => !r.resubmitted_at) ?? null;
  const delivered = (project.phase_submissions ?? []).find((s) => s.phase_number === phase);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const current = writtenPhaseText(project, phase);
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("written_reviews").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Devolutiva cancelada");
      qc.invalidateQueries({ queryKey: ["group", groupId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!delivered)
    return <p className="text-sm italic text-muted-foreground">O grupo ainda não entregou esta etapa. A devolutiva abre depois da entrega.</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Entregue em {fmtDateTime(delivered.submitted_at)}.</p>
      <details className="rounded-md border border-border">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-foreground">Ver o texto atual do grupo</summary>
        <p className="whitespace-pre-wrap border-t border-border p-3 text-sm text-foreground">{current.trim() || "(vazio)"}</p>
      </details>

      {!open && !creating && (
        <Button onClick={() => setCreating(true)}>
          <Plus /> Nova devolutiva da versão {reviews.filter((r) => r.resubmitted_at).length + 1}
        </Button>
      )}
      {creating && !open && (
        <ReviewForm groupId={groupId} projectId={project.id} phase={phase} existing={null} onDone={() => setCreating(false)} />
      )}

      {reviews.length > 0 && (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <ReviewCard key={r.id} review={r} perDay={perDay}>
              {!r.resubmitted_at && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing((v) => !v)}>
                    <PenLine /> {editing ? "Fechar edição" : "Editar"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove.mutate(r.id)} disabled={remove.isPending}>
                    <Trash2 /> Cancelar devolutiva
                  </Button>
                </div>
              )}
              {!r.resubmitted_at && editing && (
                <ReviewForm groupId={groupId} projectId={project.id} phase={phase} existing={r} onDone={() => setEditing(false)} />
              )}
              {r.resubmitted_at && (
                <ComparisonBlock groupId={groupId} review={r} comparison={comparisons.find((c) => c.review_id === r.id)} />
              )}
            </ReviewCard>
          ))}
        </ul>
      )}
    </div>
  );
}

const WRITTEN_STAGES = PHASES.filter((p) => p.number >= WRITTEN_START && p.number <= WRITTEN_END).map((p) => p.number);

/** Teacher: feedback rounds (V1 → V2) on each delivered written stage, with the AI comparison and improvement grade. */
export function TeacherWrittenReviews({ groupId, project, perDay }: { groupId: string; project: Project; perDay: number }) {
  const comparisons = useQuery(writtenComparisonsQuery(groupId));
  const delivered = new Set((project.phase_submissions ?? []).map((s) => s.phase_number));
  const firstOpen = (project.written_reviews ?? []).find((r) => !r.resubmitted_at)?.phase_number;
  const lastDelivered = [...WRITTEN_STAGES].reverse().find((n) => delivered.has(n));
  const [phase, setPhase] = useState<number>(firstOpen ?? lastDelivered ?? WRITTEN_START);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Escolha uma parte entregue, escreva a devolutiva e o prazo (já vem com {WRITTEN_REVIEW_DAYS} dias). O grupo corrige o texto, explica o
        que mudou e envia a nova versão. A IA compara as duas versões e dá uma nota de melhoria só para você. Atraso na nova versão desconta
        do bimestre da etapa.
      </p>
      <div className="flex flex-wrap gap-2">
        {WRITTEN_STAGES.map((n) => {
          const rs = stageReviews(project.written_reviews, n);
          const open = rs.some((r) => !r.resubmitted_at);
          const answered = rs.some((r) => r.resubmitted_at);
          return (
            <button
              key={n}
              type="button"
              onClick={() => setPhase(n)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                phase === n ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary",
                !delivered.has(n) && phase !== n && "text-muted-foreground",
              )}
            >
              {phaseMeta(n).name}
              {open && <span className="ml-1.5 inline-block size-2 rounded-full bg-highlight" aria-label="devolutiva aberta" />}
              {!open && answered && <span className="ml-1.5 inline-block size-2 rounded-full bg-success" aria-label="nova versão recebida" />}
            </button>
          );
        })}
      </div>
      <div className="rounded-lg border border-border p-4 md:p-5">
        <h3 className="mb-3 text-lg font-semibold">
          Etapa {phase} · {phaseMeta(phase).name}
        </h3>
        <StagePanel
          key={phase}
          groupId={groupId}
          project={project}
          phase={phase}
          perDay={perDay}
          comparisons={comparisons.data ?? []}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        <span className="mr-1 inline-block size-2 rounded-full bg-highlight" /> devolutiva aberta ·{" "}
        <span className="mx-1 inline-block size-2 rounded-full bg-success" /> nova versão recebida
      </p>
    </div>
  );
}
