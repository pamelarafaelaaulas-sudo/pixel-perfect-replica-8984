import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPhaseFeedback } from "@/lib/ai-feedback.functions";

function renderLine(line: string, i: number) {
  const bold = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
      p.startsWith("**") && p.endsWith("**") ? <strong key={j}>{p.slice(2, -2)}</strong> : p,
    );
  if (line.startsWith("## ") || line.startsWith("### "))
    return (
      <h4 key={i} className="mt-4 font-semibold text-foreground first:mt-0">
        {line.replace(/^#+\s*/, "")}
      </h4>
    );
  if (/^\s*[-*]\s+/.test(line))
    return (
      <li key={i} className="ml-5 list-disc">
        {bold(line.replace(/^\s*[-*]\s+/, ""))}
      </li>
    );
  if (!line.trim()) return null;
  return <p key={i}>{bold(line)}</p>;
}

export function AiFeedback({ phaseName, text }: { phaseName: string; text: string }) {
  const fn = useServerFn(getPhaseFeedback);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tooShort = text.trim().length < 20;

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const r = await fn({ data: { phaseName, text } });
      setFeedback(r.feedback);
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
          <p className="font-medium">Sugestões da IA</p>
          <p className="text-sm text-muted-foreground">
            Receba dicas sobre clareza, organização e citações do texto desta etapa.
          </p>
        </div>
        <Button variant="secondary" onClick={run} disabled={loading || tooShort}>
          {loading ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {loading ? "Analisando…" : feedback ? "Analisar de novo" : "Pedir sugestões"}
        </Button>
      </div>
      {tooShort && <p className="mt-2 text-xs text-muted-foreground">Escreva um pouco mais para pedir sugestões.</p>}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      {feedback && <div className="mt-4 space-y-1 text-sm">{feedback.split("\n").map(renderLine)}</div>}
    </div>
  );
}
