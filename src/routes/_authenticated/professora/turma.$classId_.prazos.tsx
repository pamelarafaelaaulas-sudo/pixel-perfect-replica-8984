import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { AlertTriangle, ArrowLeft, CalendarClock, Calculator, Check, Clock, Lock, SkipForward, Users } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { classDetailQuery } from "@/lib/queries";
import { PHASES } from "@/lib/phases";
import { endOfDayFromInput, fmtDate, fmtDateTime, plural, toDateInput } from "@/lib/format";
import { classLateness, daysLate, formatPoints, phasePenalty, phaseTotals, type PhaseInfo, type PhaseTotals } from "@/lib/penalty";

export const Route = createFileRoute("/_authenticated/professora/turma/$classId_/prazos")({
  head: () => ({
    meta: [
      { title: "Prazos e atrasos — Caderno de Projetos" },
      { name: "description", content: "Quando cada grupo entregou cada etapa e quanto perdeu por atraso." },
      { property: "og:title", content: "Prazos e atrasos — Caderno de Projetos" },
      { property: "og:description", content: "Quando cada grupo entregou cada etapa e quanto perdeu por atraso." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(classDetailQuery(params.classId));
    if (!data) throw notFound();
  },
  component: DeadlinesPage,
});

function DeadlinesPage() {
  const { classId } = Route.useParams();
  const { data: cls } = useSuspenseQuery(classDetailQuery(classId));
  const qc = useQueryClient();

  const saved = useMemo(
    () => [...(cls?.schedules ?? [])].sort((a, b) => a.phase_number - b.phase_number),
    [cls?.schedules],
  );
  const savedRate = Number(cls?.late_penalty_per_day ?? 0.5);
  const [dates, setDates] = useState<Record<number, string>>(() =>
    Object.fromEntries(saved.map((s) => [s.phase_number, toDateInput(s.due_date)])),
  );
  const [rate, setRate] = useState(() => formatPoints(savedRate));

  const parsedRate = Number(rate.replace(",", "."));
  const rateValid = rate.trim() !== "" && Number.isFinite(parsedRate) && parsedRate >= 0;
  const perDay = rateValid ? parsedRate : savedRate;
  // Draft deadlines: the numbers on this page update live before saving.
  const schedules = saved.map((s) => {
    const d = dates[s.phase_number];
    return { ...s, due_date: d ? endOfDayFromInput(d) : s.due_date };
  });
  const dirty =
    (rateValid && parsedRate !== savedRate) ||
    saved.some((s) => (dates[s.phase_number] ?? "") !== toDateInput(s.due_date));

  const save = useMutation({
    mutationFn: async () => {
      if (!rateValid) throw new Error("Desconto inválido. Use um número como 0,5.");
      const results = await Promise.all([
        ...schedules.map((s) => supabase.from("schedules").update({ due_date: s.due_date }).eq("id", s.id)),
        supabase.from("classes").update({ late_penalty_per_day: parsedRate }).eq("id", classId),
      ]);
      const err = results.find((r) => r.error)?.error;
      if (err) throw err;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["class", classId] });
      qc.invalidateQueries({ queryKey: ["teacher"] });
      toast.success("Prazos e desconto salvos");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function reset() {
    setDates(Object.fromEntries(saved.map((s) => [s.phase_number, toDateInput(s.due_date)])));
    setRate(formatPoints(savedRate));
  }

  if (!cls) return null;

  const summary = classLateness({
    perDay,
    schedules,
    groups: (cls.groups ?? []).map((g) => ({
      id: g.id,
      name: g.group_name,
      members: (g.group_members ?? []).map((m) => m.profiles?.name ?? "").filter(Boolean),
      currentPhase: g.projects?.current_phase ?? 1,
      submissions: g.projects?.phase_submissions ?? [],
    })),
  });
  const totals = phaseTotals(summary.rows);

  const memberLinks: Record<string, { id: string; name: string }[]> = Object.fromEntries(
    (cls.groups ?? []).map((g) => [
      g.id,
      (g.group_members ?? []).map((m) => ({ id: m.student_id, name: m.profiles?.name ?? "Aluno" })),
    ]),
  );

  return (
    <>
      <Link
        to="/professora/turma/$classId"
        params={{ classId }}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {cls.name}
      </Link>
      <PageHeader
        eyebrow="Prazos e atrasos"
        title={cls.name}
        description="Ajuste o prazo de cada etapa e o desconto por dia. Os números da página mudam na hora para você ver o efeito antes de salvar."
      />

      <section className="card-paper mb-6 p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <CalendarClock className="size-5 text-primary" /> Prazos e desconto por etapa
          </h2>
          {dirty && <Badge variant="warning">Prévia: alterações ainda não salvas</Badge>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PHASES.map((p) => {
            const t = totals.find((x) => x.phase === p.number)!;
            return (
              <div key={p.number} className="rounded-lg border border-border p-4">
                <span className="block font-mono text-xs text-muted-foreground">ETAPA {p.number}</span>
                <Label htmlFor={`due-${p.number}`} className="mb-2 block font-medium">
                  {p.name}
                </Label>
                <Input
                  id={`due-${p.number}`}
                  type="date"
                  value={dates[p.number] ?? ""}
                  onChange={(e) => setDates((d) => ({ ...d, [p.number]: e.target.value }))}
                />
                <p className="mt-1 text-xs text-muted-foreground">Vale até 23h59 deste dia.</p>
                <PhaseTotalsView t={t} />
              </div>
            );
          })}
        </div>
        <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-border pt-5">
          <div className="space-y-2">
            <Label htmlFor="rate">Desconto por dia de atraso (pontos)</Label>
            <Input
              id="rate"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              inputMode="decimal"
              className={cn("w-40", !rateValid && "border-destructive")}
            />
          </div>
          <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending || !rateValid}>
            Salvar prazos e desconto
          </Button>
          {dirty && (
            <Button variant="ghost" onClick={reset}>
              Desfazer
            </Button>
          )}
        </div>
      </section>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Desconto por dia" value={formatPoints(perDay)} />
        <Stat label="Grupos com atraso" value={`${summary.lateGroups} de ${summary.rows.length}`} />
        <Stat
          label="Total descontado na turma"
          value={summary.totalPenalty > 0 ? `−${formatPoints(summary.totalPenalty)}` : "0,0"}
          warn={summary.totalPenalty > 0}
        />
      </div>

      <HowItWorks schedules={schedules} perDay={perDay} />

      {summary.rows.length === 0 ? (
        <EmptyState
          icon={<Users className="size-5" />}
          title="Nenhum grupo ainda"
          text={`Quando os alunos entrarem com o código ${cls.class_code}, as entregas aparecem aqui.`}
        />
      ) : (
        <section className="card-paper overflow-x-auto p-0">
          <table className="w-full min-w-[1900px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 font-medium text-muted-foreground">Grupo</th>
                {PHASES.map((p) => {
                  const due = schedules.find((s) => s.phase_number === p.number)?.due_date;
                  return (
                    <th key={p.number} className="px-3 py-3 align-bottom">
                      <span className="block font-mono text-xs text-muted-foreground">ETAPA {p.number}</span>
                      <span className="block font-medium text-foreground">{p.name}</span>
                      <span className="block text-xs font-normal text-muted-foreground">Prazo {fmtDate(due)}</span>
                    </th>
                  );
                })}
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Dias / total</th>
              </tr>
            </thead>
            <tbody>
              {summary.rows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0 align-top">
                  <td className="px-4 py-4">
                    <Link
                      to="/professora/grupo/$groupId"
                      params={{ groupId: row.id }}
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {row.name}
                    </Link>
                    <p className="max-w-48 text-xs text-muted-foreground">
                      {(memberLinks[row.id] ?? []).length === 0
                        ? "Sem integrantes"
                        : (memberLinks[row.id] ?? []).map((m, i) => (
                            <span key={m.id}>
                              {i > 0 && ", "}
                              <Link
                                to="/professora/aluno/$studentId"
                                params={{ studentId: m.id }}
                                className="hover:text-primary hover:underline"
                              >
                                {m.name}
                              </Link>
                            </span>
                          ))}
                    </p>
                  </td>
                  {row.phases.map((p) => (
                    <td key={p.phase} className="px-3 py-4">
                      <PhaseCell p={p} />
                    </td>
                  ))}
                  <td className="px-4 py-4 text-right">
                    <p className="text-xs text-muted-foreground">{plural(row.totalDays, "dia", "dias")}</p>
                    <p
                      className={cn(
                        "font-mono text-base font-semibold",
                        row.totalPenalty > 0 ? "text-destructive" : "text-success",
                      )}
                    >
                      {row.totalPenalty > 0 ? `−${formatPoints(row.totalPenalty)}` : "0,0"}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

function PhaseTotalsView({ t }: { t: PhaseTotals }) {
  return (
    <div className="mt-3 space-y-1 border-t border-border pt-3 text-xs">
      <p className="text-muted-foreground">
        {t.onTime} no prazo · {t.deliveredLate} com atraso
        {t.openLate > 0 && <span className="text-destructive"> · {t.openLate} atrasada(s) em aberto</span>}
        {t.pending > 0 && ` · ${t.pending} em andamento`}
      </p>
      <p className={cn("font-mono text-sm font-semibold", t.penalty > 0 ? "text-destructive" : "text-success")}>
        {t.penalty > 0 ? `−${formatPoints(t.penalty)}` : "0,0"}{" "}
        <span className="font-sans text-xs font-normal text-muted-foreground">({plural(t.days, "dia", "dias")} no total)</span>
      </p>
    </div>
  );
}

function HowItWorks({ schedules, perDay }: { schedules: { phase_number: number; due_date: string }[]; perDay: number }) {
  const [phase, setPhase] = useState("1");
  const [delivered, setDelivered] = useState(() => format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const due = schedules.find((s) => s.phase_number === Number(phase))?.due_date ?? null;
  const deliveredAt = delivered ? new Date(delivered) : null;
  const hours = due && deliveredAt ? (deliveredAt.getTime() - new Date(due).getTime()) / 3_600_000 : 0;
  const days = due && deliveredAt ? daysLate(due, deliveredAt) : 0;
  const penalty = phasePenalty(days, perDay);

  return (
    <section className="card-paper mb-6 grid gap-6 p-6 lg:grid-cols-2">
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold">
          <Calculator className="size-5 text-primary" /> Como o atraso é calculado
        </h2>
        <ul className="ml-5 list-disc space-y-1.5 text-sm text-muted-foreground">
          <li>O prazo de cada etapa vale até as 23h59 do dia escolhido.</li>
          <li>
            Qualquer entrega depois disso já conta <strong className="text-foreground">1 dia</strong>. Cada 24 horas a mais
            soma outro dia (sempre arredonda para cima).
          </li>
          <li>
            Desconto da etapa = <strong className="text-foreground">dias de atraso × {formatPoints(perDay)}</strong> ponto(s).
          </li>
          <li>Etapas ainda não entregues continuam somando dias depois do prazo, até o grupo entregar.</li>
          <li>O desconto do grupo é a soma das etapas e sai da nota de cada trimestre, sem ficar abaixo de zero.</li>
          <li>
            Essa conta é uma regra fixa do app, igual para todos os grupos. A IA não participa: ela só dá sugestões sobre o
            texto.
          </li>
        </ul>
      </div>
      <div className="rounded-lg bg-muted p-4">
        <p className="mb-3 font-medium">Simule uma entrega</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="sim-phase">Etapa</Label>
            <Select value={phase} onValueChange={setPhase}>
              <SelectTrigger id="sim-phase">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PHASES.map((p) => (
                  <SelectItem key={p.number} value={String(p.number)}>
                    {p.number}. {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sim-date">Data e hora da entrega</Label>
            <Input id="sim-date" type="datetime-local" value={delivered} onChange={(e) => setDelivered(e.target.value)} />
          </div>
        </div>
        <ol className="mt-4 space-y-1.5 text-sm">
          <li>
            Prazo: <strong>{fmtDateTime(due)}</strong>
          </li>
          <li>
            Entrega: <strong>{deliveredAt ? fmtDateTime(deliveredAt) : "—"}</strong>
          </li>
          <li>
            {hours <= 0 ? (
              <>Entregue antes do prazo: <strong className="text-success">0 dia de atraso</strong>.</>
            ) : (
              <>
                Passou {formatPoints(Math.round(hours * 10) / 10)} hora(s) do prazo → arredonda para{" "}
                <strong>{plural(days, "dia", "dias")}</strong>.
              </>
            )}
          </li>
          <li className="pt-1 text-base">
            {plural(days, "dia", "dias")} × {formatPoints(perDay)} ={" "}
            <strong className={cn("font-mono", penalty > 0 ? "text-destructive" : "text-success")}>
              {penalty > 0 ? `−${formatPoints(penalty)}` : "0,0"} ponto(s)
            </strong>
          </li>
        </ol>
      </div>
    </section>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="card-paper p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-mono text-2xl font-semibold", warn ? "text-destructive" : "text-foreground")}>{value}</p>
    </div>
  );
}

function PhaseCell({ p }: { p: PhaseInfo }) {
  const late = p.daysLate > 0;
  if (p.state === "delivered") {
    return (
      <div className="space-y-1">
        <Badge variant={late ? "warning" : "success"} className="gap-1">
          {late ? <AlertTriangle className="size-3" /> : <Check className="size-3" />}
          {late ? "Entregue com atraso" : "No prazo"}
        </Badge>
        <p className="text-xs text-foreground">{fmtDateTime(p.submittedAt)}</p>
        {late && (
          <p className="text-xs font-medium text-destructive">
            {plural(p.daysLate, "dia", "dias")} · −{formatPoints(p.penalty)}
          </p>
        )}
      </div>
    );
  }
  if (p.state === "in_progress") {
    return (
      <div className="space-y-1">
        <Badge variant={late ? "destructive" : "secondary"} className="gap-1">
          {late ? <AlertTriangle className="size-3" /> : <Clock className="size-3" />}
          {late ? "Atrasada" : "Em andamento"}
        </Badge>
        {late ? (
          <p className="text-xs font-medium text-destructive">
            {plural(p.daysLate, "dia", "dias")} até agora · −{formatPoints(p.penalty)}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Ainda não entregue</p>
        )}
      </div>
    );
  }
  if (p.state === "skipped") {
    return (
      <Badge variant="muted" className="gap-1">
        <SkipForward className="size-3" /> Liberada
      </Badge>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Lock className="size-3" /> Não liberada
    </span>
  );
}
