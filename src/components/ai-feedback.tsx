import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getPhaseEvaluation } from "@/lib/ai-feedback.functions";
import { formatPoints } from "@/lib/penalty";
import { fmtDateTime } from "@/lib/format";
import type { AiEvaluation } from "@/lib/ai-score";

export function scoreTone(n: number) {
  if (n >= 7) return "text-success";
  if (n >= 5) return "text-warning";
  return "text-destructive";
}

function barTone(n: number) {
  if (n >= 7) return "bg-success";
  if (n >= 5) return "bg-warning";
  return "bg-destructive";
}

function TipList({ title, tips }: { title: string; tips: string[] }) {
  if (tips.length === 0) return null;
  return (
    <div>
      <h4 className="font-semibold text-foreground">{title}</h4>
      <ul className="mt-1 space-y-1">
        {tips.map((t, i) => (
          <li key={i} className="ml-5 list-disc">
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AiEvaluationView({ evaluation, showTips = true }: { evaluation: AiEvaluation; showTips?: boolean }) {
  return (
    <div className="space-y-5 text-sm">
      <div className="flex flex-wrap items-center gap-5">
        <div className="card-paper grid min-w-28 place-items-center px-5 py-3 text-center">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Nota da IA</span>
          <span className={cn("font-mono text-4xl font-semibold", scoreTone(evaluation.overall))}>
            {formatPoints(evaluation.overall)}
          </span>
          <span className="text-xs text-muted-foreground">de 10</span>
        </div>
        {evaluation.summary && <p className="max-w-xl flex-1 text-foreground">{evaluation.summary}</p>}
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {evaluation.criteria.map((c) => (
          <li key={c.key} className="card-paper p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-foreground">{c.label}</span>
              <span className={cn("font-mono font-semibold", scoreTone(c.score))}>{formatPoints(c.score)}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full rounded-full", barTone(c.score))} style={{ width: `${c.score * 10}%` }} />
            </div>
            {c.comment && <p className="mt-2 text-xs text-muted-foreground">{c.comment}</p>}
          </li>
        ))}
      </ul>

      {showTips && (
        <div className="space-y-4">
          <TipList title="Dicas de clareza" tips={evaluation.tips.clarity} />
          <TipList title="Dicas de organização" tips={evaluation.tips.organization} />
          <TipList title="Dicas de citações" tips={evaluation.tips.citations} />
        </div>
      )}
    </div>
  );
}

export function AiFeedback({
  projectId,
  groupId,
  phaseNumber,
  text,
  saved,
}: {
  projectId: string;
  groupId: string;
  phaseNumber: number;
  text: string;
  saved?: { evaluation: AiEvaluation; createdAt: string } | null;
}) {
  const fn = useServerFn(getPhaseEvaluation);
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tooShort = text.trim().length < 20;

  async function run() {
    setLoading(true);
    setError(null);
    try {
      await fn({ data: { projectId, phaseNumber, text } });
      await qc.invalidateQueries({ queryKey: ["ai", "group", groupId] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 rounded-lg border border-border bg-muted/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">Avaliação da IA</p>
          <p className="text-sm text-muted-foreground">
            Nota estimada por critério e dicas de clareza, organização e citações. Fica salva para a professora ver e
            não substitui a nota dela.
          </p>
        </div>
        <Button variant="secondary" onClick={run} disabled={loading || tooShort}>
          {loading ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {loading ? "Avaliando…" : saved ? "Avaliar de novo" : "Avaliar com IA"}
        </Button>
      </div>
      {tooShort && <p className="mt-2 text-xs text-muted-foreground">Escreva um pouco mais para pedir a avaliação.</p>}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {saved && (
        <div className="mt-5">
          <p className="mb-3 text-xs text-muted-foreground">Última avaliação: {fmtDateTime(saved.createdAt)}</p>
          <AiEvaluationView evaluation={saved.evaluation} />
        </div>
      )}
    </div>
  );
}
