import { useState } from "react";
import { useIsMutating, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ArrowDown,
  CheckCircle2,
  ClipboardCopy,
  Lightbulb,
  Loader2,
  MessageSquareQuote,
  Palette,
  RefreshCw,
  Sparkles,
  Star,
  Workflow,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { diagnoseBanner } from "@/lib/banner-review.functions";
import {
  BANNER_AXES,
  MIN_REFERENCES,
  SEVERITY_LABEL,
  criticalReasons,
  mermaidFromSteps,
  type BannerAxisScore,
  type BannerFeedback,
  type Severity,
} from "@/lib/banner-review";
import { formatPoints } from "@/lib/penalty";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Runs the AI diagnosis for the group's current banner file; any screen can show it is running. */
export function useDiagnoseBanner(groupId: string) {
  const qc = useQueryClient();
  const fn = useServerFn(diagnoseBanner);
  return useMutation({
    mutationKey: ["banner-diagnose", groupId],
    mutationFn: () => fn({ data: { groupId } }),
    onSuccess: (r) => {
      toast.success(`Diagnóstico da IA pronto (versão ${r.version}).`);
      qc.invalidateQueries({ queryKey: ["banner"] });
      qc.invalidateQueries({ queryKey: ["teacher", "banners"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function DiagnoseButton({ groupId, hasFile, label }: { groupId: string; hasFile: boolean; label: string }) {
  const diagnose = useDiagnoseBanner(groupId);
  const running = useIsMutating({ mutationKey: ["banner-diagnose", groupId] }) > 0;
  return (
    <Button type="button" variant="secondary" size="sm" onClick={() => diagnose.mutate()} disabled={!hasFile || running}>
      {running ? <Loader2 className="animate-spin" /> : label.startsWith("Refazer") ? <RefreshCw /> : <Sparkles />} {label}
    </Button>
  );
}

export function DiagnosisRunning({ groupId }: { groupId: string }) {
  const running = useIsMutating({ mutationKey: ["banner-diagnose", groupId] }) > 0;
  if (!running) return null;
  return (
    <p className="flex items-center gap-2 rounded-lg border border-secondary/40 bg-secondary/10 p-3 text-sm text-foreground">
      <Loader2 className="size-4 animate-spin text-secondary" /> A IA está lendo o banner e comparando com o projeto escrito.
      Isso leva cerca de 1 minuto.
    </p>
  );
}

const SEVERITY_STYLE: Record<Severity, { box: string; dot: string; icon: typeof XCircle }> = {
  critico: { box: "border-destructive/40 bg-destructive/10", dot: "bg-destructive", icon: XCircle },
  atencao: { box: "border-warning/50 bg-warning/10", dot: "bg-warning", icon: AlertTriangle },
  destaque: { box: "border-success/40 bg-success/10", dot: "bg-success", icon: CheckCircle2 },
};

function copy(text: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success("Copiado!"),
    () => toast.error("Não foi possível copiar."),
  );
}

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
      ) : (
        <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
      )}
      <span className={ok ? "text-muted-foreground" : "text-foreground"}>{children}</span>
    </li>
  );
}

function Block({ icon: Icon, title, children }: { icon: typeof Star; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="size-4 text-primary" /> {title}
      </h4>
      {children}
    </div>
  );
}

/** Methodology flowchart drawn as boxes, plus the Mermaid code to copy. */
function Flowchart({ steps }: { steps: string[] }) {
  if (steps.length === 0) return null;
  return (
    <Block icon={Workflow} title="Fluxograma da metodologia">
      <ol className="flex flex-col items-center gap-1">
        {steps.map((s, i) => (
          <li key={`${i}-${s}`} className="flex w-full max-w-sm flex-col items-center gap-1">
            <span className="w-full rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-center text-sm text-foreground">
              <span className="mr-1 font-mono text-xs text-primary">{i + 1}.</span> {s}
            </span>
            {i < steps.length - 1 && <ArrowDown className="size-4 text-muted-foreground" />}
          </li>
        ))}
      </ol>
      <Button type="button" variant="ghost" size="sm" onClick={() => copy(mermaidFromSteps(steps))}>
        <ClipboardCopy /> Copiar código Mermaid
      </Button>
    </Block>
  );
}

/**
 * The AI diagnosis of one banner version. Students see only the guidance;
 * the teacher also gets `axes` (scores) and the suggested total.
 */
export function DiagnosisView({
  feedback: f,
  createdAt,
  version,
  fileName,
  axes,
  total,
}: {
  feedback: BannerFeedback;
  createdAt: string;
  version: number;
  fileName: string | null;
  axes?: BannerAxisScore[];
  total?: number;
}) {
  const reasons = criticalReasons(f);
  const [openTip, setOpenTip] = useState<string | undefined>(undefined);
  const axisComment = (key: string) => f.axisComments.find((a) => a.key === key)?.comment ?? "";
  const sortedNotes = [...f.annotations].sort(
    (a, b) => ["critico", "atencao", "destaque"].indexOf(a.severity) - ["critico", "atencao", "destaque"].indexOf(b.severity),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Versão {version} · {fmtDateTime(createdAt)}
            {fileName ? ` · ${fileName}` : ""}
          </p>
          {f.summary && <p className="mt-1 max-w-2xl text-sm text-foreground">{f.summary}</p>}
        </div>
        {total !== undefined && (
          <div className="rounded-lg bg-muted px-4 py-2 text-right">
            <p className="text-xs text-muted-foreground">Nota sugerida pela IA</p>
            <p className="font-display text-2xl font-semibold">{formatPoints(total)}</p>
          </div>
        )}
      </div>

      {reasons.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <p className="font-medium text-foreground">Corrija antes de imprimir:</p>
          <p className="text-muted-foreground">{reasons.join(" · ")}</p>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {BANNER_AXES.map((a) => {
          const s = axes?.find((x) => x.key === a.key);
          return (
            <div key={a.key} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-foreground">{a.label}</p>
                {s && (
                  <span className="shrink-0 font-mono text-sm">
                    {formatPoints(s.score)} / {formatPoints(a.max)}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{axisComment(a.key) || a.hint}</p>
            </div>
          );
        })}
      </div>

      <Block icon={CheckCircle2} title="Conferência">
        <ul className="space-y-1.5">
          <Check ok={f.referencesFound >= MIN_REFERENCES}>
            {f.referencesFound} referência(s) encontrada(s) — mínimo de {MIN_REFERENCES} na NBR 6023
          </Check>
          <Check ok={f.sectionsMissing.length === 0}>
            {f.sectionsMissing.length === 0 ? "Todas as seções obrigatórias" : `Falta: ${f.sectionsMissing.join(", ")}`}
          </Check>
          <Check ok={f.templateOk}>{f.templateOk ? "Cabeçalho do modelo oficial mantido" : "Cabeçalho do modelo oficial alterado ou sem o código"}</Check>
          <Check ok={f.thirdPersonOk}>{f.thirdPersonOk ? "Texto em 3ª pessoa" : "Há trechos em 1ª pessoa"}</Check>
          <Check ok={f.coherence.aligned}>
            {f.coherence.aligned ? "Coerente com o projeto escrito" : "Diverge do projeto escrito"}
          </Check>
          <Check ok={f.orphanCitations.length === 0}>
            {f.orphanCitations.length === 0 ? "Sem citações órfãs" : `Citações órfãs: ${f.orphanCitations.join("; ")}`}
          </Check>
        </ul>
        {f.coherence.divergences.length > 0 && (
          <ul className="ml-6 list-disc space-y-0.5 text-sm text-muted-foreground">
            {f.coherence.divergences.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        )}
      </Block>

      {sortedNotes.length > 0 && (
        <Block icon={MessageSquareQuote} title="Anotações no banner">
          <ul className="grid gap-2 md:grid-cols-2">
            {sortedNotes.map((a, i) => {
              const st = SEVERITY_STYLE[a.severity];
              const Icon = st.icon;
              return (
                <li key={`${i}-${a.note}`} className={cn("rounded-lg border p-3 text-sm", st.box)}>
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-foreground">
                    <Icon className="size-3.5" /> {SEVERITY_LABEL[a.severity]}
                    {a.section && <span className="font-normal normal-case tracking-normal text-muted-foreground">· {a.section}</span>}
                  </p>
                  <p className="mt-1 text-foreground">{a.note}</p>
                </li>
              );
            })}
          </ul>
        </Block>
      )}

      {f.resubmission && (
        <Block icon={RefreshCw} title="Auditoria do reenvio">
          <p className="text-sm text-foreground">
            Mudou cerca de <strong>{f.resubmission.changePercent}%</strong> em relação à versão anterior. {f.resubmission.summary}
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <ul className="space-y-1">
              {f.resubmission.fixed.map((x) => (
                <Check key={x} ok>
                  {x}
                </Check>
              ))}
            </ul>
            <ul className="space-y-1">
              {f.resubmission.pending.map((x) => (
                <Check key={x} ok={false}>
                  {x}
                </Check>
              ))}
            </ul>
          </div>
        </Block>
      )}

      {f.bancaQuestions.length > 0 && (
        <Block icon={Star} title="Simulador da banca: 5 perguntas prováveis">
          <Accordion type="single" collapsible value={openTip} onValueChange={setOpenTip}>
            {f.bancaQuestions.map((q, i) => (
              <AccordionItem key={`${i}-${q.question}`} value={String(i)}>
                <AccordionTrigger className="text-left text-sm">
                  {i + 1}. {q.question}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  <strong className="text-foreground">Como responder:</strong> {q.tip}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Block>
      )}

      {f.rewriteSuggestions.length > 0 && (
        <Block icon={Lightbulb} title="Discussão dos resultados: sugestões de reescrita">
          <ol className="ml-5 list-decimal space-y-1 text-sm text-muted-foreground">
            {f.rewriteSuggestions.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </Block>
      )}

      <Flowchart steps={f.flowchartSteps} />

      {(f.visualIdeas.length > 0 || f.canvaPrompts.length > 0) && (
        <Block icon={Palette} title="Direção de arte para o Canva">
          {f.visualIdeas.length > 0 && (
            <ul className="ml-5 list-disc space-y-0.5 text-sm text-muted-foreground">
              {f.visualIdeas.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          )}
          {f.canvaPrompts.map((pr, i) => (
            <div key={`${i}-${pr}`} className="rounded-lg bg-muted p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="text-foreground">
                  <span className="font-medium">Prompt {i + 1}:</span> {pr}
                </p>
                <Button type="button" variant="ghost" size="icon" aria-label={`Copiar prompt ${i + 1}`} onClick={() => copy(pr)}>
                  <ClipboardCopy />
                </Button>
              </div>
            </div>
          ))}
        </Block>
      )}

      {f.titleSuggestions.length > 0 && (
        <Block icon={Sparkles} title="Sugestões de título">
          <ul className="flex flex-col gap-1.5">
            {f.titleSuggestions.map((t) => (
              <li key={t}>
                <Badge variant="outline" className="whitespace-normal text-left font-normal">
                  {t}
                </Badge>
              </li>
            ))}
          </ul>
        </Block>
      )}
    </div>
  );
}
