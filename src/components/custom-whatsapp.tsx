import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Loader2, MessageSquareText, Send } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
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
import { sendCustomWhatsapp } from "@/lib/whatsapp.functions";
import {
  CUSTOM_MAX_CHARS,
  cleanCustomText,
  customMessageProblems,
  customParams,
  customText,
  waLink,
  type MessageRecipient,
  type SkippedReminder,
} from "@/lib/reminders";
import { plural } from "@/lib/format";
import { cn } from "@/lib/utils";

const TEMPLATE_NOTE: Record<string, string> = {
  PENDING: "Mensagem aguardando aprovação do WhatsApp (de alguns minutos até 48 horas). O envio fica travado até lá.",
  REJECTED: "O WhatsApp recusou o modelo desta mensagem.",
  MISSING: "O modelo desta mensagem não foi encontrado no WhatsApp.",
  UNKNOWN: "Não foi possível consultar o WhatsApp agora.",
};

/** Teacher writes her own text and sends it to the students she ticks (or everyone at once). */
export function CustomWhatsappCard({
  recipients,
  skipped,
  templateStatus,
  rejectedReason,
  allowed = true,
  teacherName = "Pâmela",
}: {
  recipients: MessageRecipient[];
  skipped: SkippedReminder[];
  templateStatus: string;
  rejectedReason: string | null;
  allowed?: boolean;
  teacherName?: string;
}) {
  const qc = useQueryClient();
  const sendFn = useServerFn(sendCustomWhatsapp);
  const [text, setText] = useState("");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const classes = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of recipients) m.set(r.classId, r.className);
    return [...m.entries()].map(([id, name]) => ({ id, name }));
  }, [recipients]);
  const visible = classFilter === "all" ? recipients : recipients.filter((r) => r.classId === classFilter);
  const allVisibleChecked = visible.length > 0 && visible.every((r) => selected.has(r.studentId));
  const approved = templateStatus === "APPROVED";
  const problems = customMessageProblems(text, selected.size);
  const length = cleanCustomText(text).length;

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const toggleVisible = (on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of visible) {
        if (on) next.add(r.studentId);
        else next.delete(r.studentId);
      }
      return next;
    });

  const send = useMutation({
    mutationFn: () => sendFn({ data: { studentIds: [...selected], text } }),
    onSuccess: (r) => {
      if (r.templateStatus !== "APPROVED") toast.error("A mensagem ainda não foi aprovada pelo WhatsApp. Nada foi enviado.");
      else {
        toast.success(`${plural(r.sent, "mensagem enviada", "mensagens enviadas")}${r.failed ? ` · ${r.failed} com falha` : ""}`);
        setText("");
        setSelected(new Set());
      }
      qc.invalidateQueries({ queryKey: ["teacher", "whatsapp"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const firstSelected = recipients.find((r) => selected.has(r.studentId));
  const [sampleName, sampleText] = customParams(firstSelected?.studentName ?? "[nome]", text || "[sua mensagem]");

  return (
    <section className="card-paper mt-8 p-5">
      <h2 className="flex items-center gap-2 text-xl font-semibold">
        <MessageSquareText className="size-5 text-primary" /> Mensagem personalizada
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Escreva um recado e escolha quem recebe: alguns alunos, uma turma inteira ou todos de uma vez.
      </p>
      <p className="mt-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
        <b>Grátis:</b> escreva o recado e clique em “Abrir no WhatsApp” ao lado de cada aluno. Seu WhatsApp abre com a
        mensagem pronta — é só apertar enviar. Não usa o envio pago da Meta.
      </p>
      {allowed && !approved && (
        <p className="mt-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          {TEMPLATE_NOTE[templateStatus] ?? TEMPLATE_NOTE["UNKNOWN"]}
          {rejectedReason && ` Motivo: ${rejectedReason}`}
        </p>
      )}

      <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-3">
          <Textarea
            rows={6}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ex.: Lembrem de trazer o banner impresso na aula de quinta-feira."
            aria-label="Texto da mensagem"
          />
          <p className={cn("text-right text-xs", length > CUSTOM_MAX_CHARS ? "text-destructive" : "text-muted-foreground")}>
            {length}/{CUSTOM_MAX_CHARS} caracteres
          </p>
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Como o aluno recebe</p>
            <p>
              Olá, <b>{sampleName}</b>! A professora {teacherName} deixou um recado sobre o seu projeto científico no FECITI Flow:{" "}
              <b>{sampleText}</b> Em caso de dúvida, fale com a professora na sala de aula ou pelo FECITI Flow.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">Quebras de linha viram “·”, porque o WhatsApp não aceita parágrafos nesse tipo de mensagem.</p>
          </div>
          {problems.length > 0 && text && (
            <ul className="ml-5 list-disc text-xs text-muted-foreground">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          {allowed && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button className="w-full" disabled={!approved || problems.length > 0 || send.isPending}>
                {send.isPending ? <Loader2 className="animate-spin" /> : <Send />} Enviar para{" "}
                {plural(selected.size, "aluno", "alunos")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Enviar a mensagem?</AlertDialogTitle>
                <AlertDialogDescription>
                  {plural(selected.size, "aluno vai", "alunos vão")} receber o seu recado no WhatsApp.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => send.mutate()}>Enviar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          )}
        </div>

        <div className="rounded-lg border border-border">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <Button size="sm" variant={classFilter === "all" ? "default" : "outline"} onClick={() => setClassFilter("all")}>
              Todas as turmas
            </Button>
            {classes.map((c) => (
              <Button
                key={c.id}
                size="sm"
                variant={classFilter === c.id ? "default" : "outline"}
                onClick={() => setClassFilter(c.id)}
              >
                {c.name}
              </Button>
            ))}
          </div>
          {recipients.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nenhum aluno com WhatsApp cadastrado.</p>
          ) : (
            <>
              <label className="flex cursor-pointer items-center gap-3 border-b border-border px-4 py-2.5 text-sm font-medium">
                <Checkbox checked={allVisibleChecked} onCheckedChange={(v) => toggleVisible(v === true)} aria-label="Selecionar todos" />
                {classFilter === "all" ? "Selecionar todos" : "Selecionar a turma toda"}
                <Badge variant="muted" className="ml-auto">
                  {selected.size} de {recipients.length}
                </Badge>
              </label>
              <ul className="max-h-80 overflow-y-auto">
                {visible.map((r) => (
                  <li key={r.studentId}>
                    <label className="flex cursor-pointer items-center gap-3 px-4 py-2 text-sm hover:bg-muted/50">
                      <Checkbox
                        checked={selected.has(r.studentId)}
                        onCheckedChange={(v) => toggle(r.studentId, v === true)}
                        aria-label={r.studentName}
                      />
                      <span>
                        <span className="font-medium">{r.studentName}</span>
                        <span className="block text-xs text-muted-foreground">
                          {r.className} · {r.groupName}
                        </span>
                      </span>
                      {text.trim() && (
                        <a
                          href={waLink(r.phone, customText(r.studentName, text, teacherName))}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-primary hover:bg-muted"
                        >
                          <MessageSquareText className="size-3.5" /> Abrir no WhatsApp
                        </a>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
          {skipped.length > 0 && (
            <div className="border-t border-border px-4 py-3">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Não podem receber</p>
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {skipped.map((s, i) => (
                  <li key={i}>
                    {s.studentName} ({s.className} · {s.groupName}) — {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
