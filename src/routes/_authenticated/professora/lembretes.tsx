import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, CalendarClock, CheckCheck, Loader2, MessageCircle, Send, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
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
import { whatsappRemindersQuery } from "@/lib/queries";
import { getReminderOverview, sendRemindersNow } from "@/lib/whatsapp.functions";
import { PHASES, phaseMeta } from "@/lib/phases";
import { daysText, dueText, reminderParams } from "@/lib/reminders";
import { fmtDateTime, plural } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/professora/lembretes")({
  head: () => ({
    meta: [
      { title: "Lembretes no WhatsApp — PamLab" },
      { name: "description", content: "Envie aos alunos, pelo WhatsApp, quantos dias faltam para o prazo de cada etapa." },
      { property: "og:title", content: "Lembretes no WhatsApp — PamLab" },
      { property: "og:description", content: "Envie aos alunos, pelo WhatsApp, quantos dias faltam para o prazo de cada etapa." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(whatsappRemindersQuery),
  component: RemindersPage,
});

const TEMPLATE_LABEL: Record<string, { text: string; tone: "success" | "muted" | "destructive" }> = {
  APPROVED: { text: "Mensagem aprovada pelo WhatsApp", tone: "success" },
  PENDING: { text: "Mensagem aguardando aprovação do WhatsApp", tone: "muted" },
  REJECTED: { text: "Mensagem recusada pelo WhatsApp", tone: "destructive" },
  MISSING: { text: "Mensagem não encontrada no WhatsApp", tone: "destructive" },
  UNKNOWN: { text: "Não foi possível consultar o WhatsApp", tone: "destructive" },
};

const STATUS_LABEL: Record<string, string> = {
  accepted: "Enviada",
  sent: "Enviada",
  delivered: "Entregue",
  read: "Lida",
  failed: "Falhou",
};

function RemindersPage() {
  const { data } = useSuspenseQuery(whatsappRemindersQuery);
  const qc = useQueryClient();
  const overviewFn = useServerFn(getReminderOverview);
  const sendFn = useServerFn(sendRemindersNow);
  const overview = useQuery({ queryKey: ["teacher", "whatsapp", "overview"], queryFn: () => overviewFn() });
  const [interval, setIntervalDays] = useState(String(data.settings.interval_days));

  const saveSettings = useMutation({
    mutationFn: async (patch: { auto_enabled?: boolean; interval_days?: number }) => {
      const { error } = await supabase.from("whatsapp_settings").upsert(
        {
          teacher_id: data.teacherId,
          auto_enabled: data.settings.auto_enabled,
          interval_days: data.settings.interval_days,
          ...patch,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "teacher_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configuração salva");
      qc.invalidateQueries({ queryKey: ["teacher", "whatsapp"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const send = useMutation({
    mutationFn: () => sendFn(),
    onSuccess: (r) => {
      if (r.templateStatus !== "APPROVED") toast.error("A mensagem ainda não foi aprovada pelo WhatsApp. Nada foi enviado.");
      else if (r.total === 0) toast.info("Ninguém precisa de lembrete agora.");
      else toast.success(`${plural(r.sent, "lembrete enviado", "lembretes enviados")}${r.failed ? ` · ${r.failed} com falha` : ""}`);
      qc.invalidateQueries({ queryKey: ["teacher", "whatsapp"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const o = overview.data;
  const tpl = TEMPLATE_LABEL[o?.templateStatus ?? "UNKNOWN"] ?? TEMPLATE_LABEL["UNKNOWN"]!;
  const approved = o?.templateStatus === "APPROVED";
  const sample = o?.reminders[0];

  return (
    <>
      <Link
        to="/professora"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Minhas turmas
      </Link>
      <PageHeader
        eyebrow="Comunicação com os alunos"
        title="Lembretes no WhatsApp"
        description="O PamLab avisa cada aluno quantos dias faltam para o prazo da etapa em que o grupo está. Quem já entregou ou está com o prazo vencido não recebe."
      />

      {overview.isPending ? (
        <div className="card-paper flex items-center gap-2 p-5 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Consultando o WhatsApp…
        </div>
      ) : overview.isError ? (
        <div className="card-paper p-5 text-sm text-destructive">{(overview.error as Error).message}</div>
      ) : o && !o.allowed ? (
        <div className="card-paper flex items-start gap-3 p-5 text-sm">
          <TriangleAlert className="mt-0.5 size-5 text-accent-foreground" />
          <p>O WhatsApp ligado ao PamLab é o número da professora Pâmela. Para enviar lembretes da sua conta, peça para ligar um número seu.</p>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
          <section className="card-paper space-y-4 p-5">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-success/15 text-success">
                <MessageCircle className="size-5" />
              </span>
              <div>
                <p className="font-semibold">{o?.verifiedName ?? "WhatsApp"}</p>
                <p className="text-sm text-muted-foreground">{o?.displayPhone ?? "Número não encontrado"}</p>
              </div>
            </div>
            <Badge variant={tpl.tone === "success" ? "success" : tpl.tone === "destructive" ? "destructive" : "muted"}>
              {tpl.text}
            </Badge>
            {o?.templateStatus === "PENDING" && (
              <p className="text-xs text-muted-foreground">
                O WhatsApp revisa toda mensagem automática antes do primeiro envio (de alguns minutos até 48 horas). Os envios ficam
                travados até a aprovação.
              </p>
            )}
            {o?.rejectedReason && <p className="text-xs text-destructive">Motivo: {o.rejectedReason}</p>}

            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Mensagem</p>
              <p>
                Olá, <b>{sample ? reminderParams(sample)[0] : "[nome]"}</b>! Lembrete do PamLab: faltam{" "}
                <b>{sample ? daysText(sample.daysLeft) : "[3 dias]"}</b> para o término do prazo da etapa{" "}
                <b>{sample?.phaseName ?? "[etapa]"}</b> do seu projeto científico. O prazo encerra em{" "}
                <b>{sample ? dueText(sample.dueDate) : "[data]"}</b>. Esta é uma mensagem automática, não é necessário responder.
              </p>
            </div>

            <div className="space-y-3 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">Envio automático</p>
                  <p className="text-xs text-muted-foreground">
                    Todo dia às 8h o PamLab confere e envia quando já se passaram os dias escolhidos.
                  </p>
                </div>
                <Switch
                  checked={data.settings.auto_enabled}
                  disabled={saveSettings.isPending}
                  onCheckedChange={(v) => saveSettings.mutate({ auto_enabled: v })}
                  aria-label="Envio automático"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span>A cada</span>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  className="h-8 w-20"
                  value={interval}
                  onChange={(e) => setIntervalDays(e.target.value)}
                />
                <span>dias</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={saveSettings.isPending || Number(interval) === data.settings.interval_days}
                  onClick={() => {
                    const n = Math.round(Number(interval));
                    if (n >= 1 && n <= 30) saveSettings.mutate({ interval_days: n });
                    else toast.error("Escolha de 1 a 30 dias.");
                  }}
                >
                  Salvar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {data.settings.last_auto_run_at
                  ? `Último envio automático: ${fmtDateTime(data.settings.last_auto_run_at)}`
                  : "Ainda não houve envio automático."}
              </p>
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="w-full" disabled={!approved || !o?.reminders.length || send.isPending}>
                  {send.isPending ? <Loader2 className="animate-spin" /> : <Send />} Enviar lembrete agora
                  {o?.reminders.length ? ` (${o.reminders.length})` : ""}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Enviar agora?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {plural(o?.reminders.length ?? 0, "aluno vai", "alunos vão")} receber a mensagem no WhatsApp com o prazo da etapa
                    do seu grupo.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => send.mutate()}>Enviar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </section>

          <section className="card-paper overflow-x-auto p-0">
            <h2 className="px-5 pt-5 text-lg font-semibold">Quem recebe agora</h2>
            {o && o.reminders.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">Nenhum aluno com prazo de etapa pela frente.</p>
            ) : (
              <table className="mt-2 w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-5 py-2 font-medium">Aluno</th>
                    <th className="px-3 py-2 font-medium">Etapa</th>
                    <th className="px-3 py-2 font-medium">Prazo</th>
                    <th className="px-5 py-2 text-right font-medium">Faltam</th>
                  </tr>
                </thead>
                <tbody>
                  {o?.reminders.map((r) => (
                    <tr key={`${r.phone}-${r.phase}`} className="border-b border-border last:border-0">
                      <td className="px-5 py-2">
                        <p className="font-medium">{r.studentName}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.className} · {r.groupName}
                        </p>
                      </td>
                      <td className="px-3 py-2">{r.phaseName}</td>
                      <td className="px-3 py-2 text-muted-foreground">{dueText(r.dueDate)}</td>
                      <td className="px-5 py-2 text-right font-mono">{daysText(r.daysLeft)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {o && o.skipped.length > 0 && (
              <div className="border-t border-border px-5 py-3">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Não recebem</p>
                <ul className="space-y-0.5 text-xs text-muted-foreground">
                  {o.skipped.map((s, i) => (
                    <li key={i}>
                      {s.studentName} ({s.className} · {s.groupName}) — {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
      )}

      <section className="mt-8">
        <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold">
          <CalendarClock className="size-5" /> Prazo de cada etapa
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {data.classes.map((c) => (
            <div key={c.id} className="card-paper p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="font-semibold">{c.name}</p>
                <Link
                  to="/professora/turma/$classId/prazos"
                  params={{ classId: c.id }}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Mudar prazos →
                </Link>
              </div>
              <ul className="space-y-1 text-sm">
                {PHASES.map((p) => {
                  const due = (c.schedules ?? []).find((s) => s.phase_number === p.number)?.due_date;
                  const past = due ? new Date(due).getTime() < Date.now() : false;
                  return (
                    <li key={p.number} className="flex justify-between gap-2">
                      <span>
                        <span className="font-mono text-xs text-muted-foreground">{p.number}.</span> {p.name}
                      </span>
                      <span className={cn("text-muted-foreground", past && "line-through opacity-60")}>
                        {due ? dueText(due) : "—"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold">
          <CheckCheck className="size-5" /> Mensagens enviadas
        </h2>
        {data.messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma mensagem enviada ainda.</p>
        ) : (
          <div className="card-paper overflow-x-auto p-0">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-5 py-2 font-medium">Quando</th>
                  <th className="px-3 py-2 font-medium">Aluno</th>
                  <th className="px-3 py-2 font-medium">Etapa</th>
                  <th className="px-3 py-2 font-medium">Como</th>
                  <th className="px-5 py-2 text-right font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {data.messages.map((m) => (
                  <tr key={m.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-2 text-muted-foreground">{fmtDateTime(m.created_at)}</td>
                    <td className="px-3 py-2">{m.student_name}</td>
                    <td className="px-3 py-2">
                      {phaseMeta(m.phase_number).name}
                      {m.days_left !== null && <span className="text-muted-foreground"> · {daysText(m.days_left)}</span>}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{m.trigger === "auto" ? "Automático" : "Manual"}</td>
                    <td className="px-5 py-2 text-right">
                      <Badge
                        variant={m.status === "failed" ? "destructive" : m.status === "read" || m.status === "delivered" ? "success" : "muted"}
                        title={m.error ?? undefined}
                      >
                        {STATUS_LABEL[m.status] ?? m.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
