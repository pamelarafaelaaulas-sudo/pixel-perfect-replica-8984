import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, CalendarClock, Copy, Trash2, Users, ArrowRight, Timer, Palette, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { classDetailQuery } from "@/lib/queries";
import { BIMESTER_NUMBERS, phaseMeta } from "@/lib/phases";
import { endOfDayFromInput, fmtAgo, toDateInput } from "@/lib/format";
import { formatPoints, projectLateness } from "@/lib/penalty";
import { isCanvaUrl } from "@/lib/phase-rules";

export const Route = createFileRoute("/_authenticated/professora/turma/$classId")({
  head: () => ({
    meta: [
      { title: "Turma — Caderno de Projetos" },
      { name: "description", content: "Prazos, grupos e notas da turma." },
      { property: "og:title", content: "Turma — Caderno de Projetos" },
      { property: "og:description", content: "Prazos, grupos e notas da turma." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(classDetailQuery(params.classId));
    if (!data) throw notFound();
  },
  component: ClassPage,
});

function ClassPage() {
  const { classId } = Route.useParams();
  const { data: cls } = useSuspenseQuery(classDetailQuery(classId));
  const qc = useQueryClient();
  const navigate = useNavigate();
  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("classes").delete().eq("id", classId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Turma excluída");
      qc.invalidateQueries({ queryKey: ["teacher", "classes"] });
      navigate({ to: "/professora" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!cls) return null;

  const schedules = [...(cls.schedules ?? [])].sort((a, b) => a.phase_number - b.phase_number);
  const groups = [...(cls.groups ?? [])].sort((a, b) => a.group_name.localeCompare(b.group_name));

  return (
    <>
      <Link to="/professora" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Minhas turmas
      </Link>
      <PageHeader
        eyebrow="Turma"
        title={cls.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            Código para os alunos entrarem:
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(cls.class_code);
                toast.success("Código copiado");
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-highlight px-2 py-0.5 font-mono text-highlight-foreground"
            >
              {cls.class_code} <Copy className="size-3.5" />
            </button>
          </span>
        }
        actions={
          <>
          <Button variant="secondary" asChild>
            <Link to="/professora/turma/$classId/prazos" params={{ classId }}>
              <Timer /> Prazos e atrasos
            </Link>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline">
                <Trash2 /> Excluir turma
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir “{cls.name}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  Todos os grupos, projetos, avaliações e notas desta turma serão apagados. Não dá para desfazer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => remove.mutate()}>Excluir</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_1.6fr]">
        <div className="space-y-6">
          <ScheduleCard classId={classId} schedules={schedules} penalty={Number(cls.late_penalty_per_day)} />
          <BannerTemplateCard key={cls.banner_template_url ?? ""} classId={classId} current={cls.banner_template_url} />
        </div>

        <section className="card-paper p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Grupos</h2>
            <Badge variant="muted">{groups.length}</Badge>
          </div>
          {groups.length === 0 ? (
            <EmptyState
              icon={<Users className="size-5" />}
              title="Nenhum grupo ainda"
              text={`Passe o código ${cls.class_code} para os alunos. Eles criam ou entram num grupo de até 3.`}
            />
          ) : (
            <ul className="divide-y divide-border">
              {groups.map((g) => {
                const project = g.projects;
                const { totalPenalty } = projectLateness({
                  currentPhase: project?.current_phase ?? 1,
                  schedules,
                  submissions: project?.phase_submissions ?? [],
                  perDay: Number(cls.late_penalty_per_day),
                });
                const grades = g.grades ?? [];
                return (
                  <li key={g.id}>
                    <Link
                      to="/professora/grupo/$groupId"
                      params={{ groupId: g.id }}
                      className="group flex flex-wrap items-center gap-4 rounded-lg px-2 py-4 transition-colors hover:bg-muted"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground">{g.group_name}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {(g.group_members ?? []).map((m) => m.profiles?.name).join(", ") || "Sem integrantes"}
                        </p>
                        {project && (
                          <p className="mt-0.5 text-xs text-muted-foreground">Editado {fmtAgo(project.updated_at)}</p>
                        )}
                      </div>
                      <Badge variant="secondary">
                        Etapa {project?.current_phase ?? 1} · {phaseMeta((project?.current_phase ?? 1)).name}
                      </Badge>
                      {totalPenalty > 0 && <Badge variant="warning">−{formatPoints(totalPenalty)} atraso</Badge>}
                      <div className="flex gap-1">
                        {BIMESTER_NUMBERS.map((t) => {
                          const gr = grades.find((x) => x.trimester === t);
                          return (
                            <span
                              key={t}
                              title={`${t}º bimestre`}
                              className="min-w-10 rounded-md border border-border px-1.5 py-0.5 text-center font-mono text-xs text-muted-foreground"
                            >
                              {gr ? formatPoints(Number(gr.score)) : `B${t}`}
                            </span>
                          );
                        })}
                      </div>
                      <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function ScheduleCard({
  classId,
  schedules,
  penalty,
}: {
  classId: string;
  schedules: { id: string; phase_number: number; phase_name: string; due_date: string }[];
  penalty: number;
}) {
  const qc = useQueryClient();
  const [dates, setDates] = useState<Record<string, string>>(
    Object.fromEntries(schedules.map((s) => [s.id, toDateInput(s.due_date)])),
  );
  const [rate, setRate] = useState(formatPoints(penalty));

  const save = useMutation({
    mutationFn: async () => {
      const perDay = Number(rate.replace(",", "."));
      if (Number.isNaN(perDay) || perDay < 0) throw new Error("Desconto inválido");
      const updates = schedules.map((s) =>
        supabase.from("schedules").update({ due_date: endOfDayFromInput(dates[s.id] ?? toDateInput(s.due_date)) }).eq("id", s.id),
      );
      const results = await Promise.all([
        ...updates,
        supabase.from("classes").update({ late_penalty_per_day: perDay }).eq("id", classId),
      ]);
      const err = results.find((r) => r.error)?.error;
      if (err) throw err;
    },
    onSuccess: () => {
      toast.success("Cronograma salvo");
      qc.invalidateQueries({ queryKey: ["class", classId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="card-paper h-fit p-6">
      <h2 className="mb-1 flex items-center gap-2 text-xl font-semibold">
        <CalendarClock className="size-5 text-primary" /> Cronograma
      </h2>
      <p className="mb-5 text-sm text-muted-foreground">O prazo vale até as 23h59 do dia escolhido.</p>
      <div className="space-y-3">
        {schedules.map((s) => (
          <div key={s.id} className="grid grid-cols-[1fr_auto] items-center gap-3">
            <Label htmlFor={s.id} className="text-sm">
              <span className="font-mono text-xs text-muted-foreground">{s.phase_number}.</span> {s.phase_name}
            </Label>
            <Input
              id={s.id}
              type="date"
              value={dates[s.id] ?? ""}
              onChange={(e) => setDates((d) => ({ ...d, [s.id]: e.target.value }))}
              className="w-40"
            />
          </div>
        ))}
        <div className="grid grid-cols-[1fr_auto] items-center gap-3 border-t border-border pt-4">
          <Label htmlFor="rate" className="text-sm">
            Desconto por dia de atraso
          </Label>
          <Input id="rate" value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" className="w-40" />
        </div>
      </div>
      <Button className="mt-5 w-full" onClick={() => save.mutate()} disabled={save.isPending}>
        Salvar cronograma
      </Button>
    </section>
  );
}

function BannerTemplateCard({ classId, current }: { classId: string; current: string | null }) {
  const ready = isCanvaUrl(current);
  return (
    <section className="card-paper p-6">
      <h2 className="mb-1 flex items-center gap-2 text-xl font-semibold">
        <Palette className="size-5 text-primary" /> Modelo do banner
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        {ready
          ? "Pronto: os grupos já veem o link do Canva, o tamanho e as seções na etapa do banner."
          : "Ainda sem link do Canva: monte o modelo para os grupos poderem começar o banner."}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={ready ? "success" : "warning"}>{ready ? "Pronto para os grupos" : "Falta o link"}</Badge>
        <Button asChild variant="outline" size="sm">
          <Link to="/professora/banner" search={{ turma: classId }}>
            {ready ? "Editar modelo" : "Montar modelo"} <ArrowRight />
          </Link>
        </Button>
        {ready && (
          <a href={current!} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            Abrir no Canva <ExternalLink className="size-3" />
          </a>
        )}
      </div>
    </section>
  );
}
