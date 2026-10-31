import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, CheckCircle2, FileUp, Loader2, PenLine, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { BUCKET, BannerFileLink, bannerFileProblem, safeFileName } from "@/components/banner-stage";
import { BannerChecklist, type ChecklistState } from "@/components/banner-checklist";
import { DiagnoseButton, DiagnosisRunning, DiagnosisView, useDiagnoseBanner } from "@/components/banner-diagnosis";
import { syncBannerToDrive } from "@/lib/banner-drive.functions";
import { checklistComplete, fileFingerprint, parseBannerFeedback, type BannerAxisScore } from "@/lib/banner-review";
import { bannerDiagnosesQuery, bannerGuidanceQuery } from "@/lib/queries";
import { daysLate, formatPoints, phasePenalty } from "@/lib/penalty";
import { fmtDateTime } from "@/lib/format";
import { format } from "date-fns";

type Review = Database["public"]["Tables"]["banner_reviews"]["Row"];
type ProjectBanner = {
  id: string;
  banner_file_path: string | null;
  banner_file_name: string | null;
  banner_file_hash: string | null;
  banner_reviews?: Review[] | null;
};

const byRoundDesc = (a: Review, b: Review) => b.round - a.round;

/** "Enviada com 2 dias de atraso: −1,0 ponto na nota do banner." */
function lateText(days: number, penalty: number) {
  if (days <= 0) return "Enviada dentro do prazo, sem desconto.";
  return `Enviada com ${days} dia(s) de atraso: −${formatPoints(penalty)} ponto(s) na nota do banner (3º bimestre).`;
}

function RoundStatus({ review, perDay }: { review: Review; perDay: number }) {
  const days = daysLate(review.resubmit_due_at, review.resubmitted_at);
  const penalty = phasePenalty(days, perDay);
  if (review.resubmitted_at)
    return (
      <p className={days > 0 ? "text-sm text-destructive" : "text-sm text-success"}>
        Nova versão em {fmtDateTime(review.resubmitted_at)}. {lateText(days, penalty)}
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

function ReviewCard({ review, perDay, children }: { review: Review; perDay: number; children?: React.ReactNode }) {
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
      <div className="flex flex-wrap gap-2">
        {review.annotated_file_path && (
          <BannerFileLink path={review.annotated_file_path} name={`Banner corrigido: ${review.annotated_file_name ?? "arquivo"}`} />
        )}
        {review.reviewed_file_path && (
          <BannerFileLink path={review.reviewed_file_path} name={`Versão ${review.round}: ${review.reviewed_file_name ?? "arquivo"}`} />
        )}
        {review.resubmitted_file_path && (
          <BannerFileLink path={review.resubmitted_file_path} name={`Versão ${review.round + 1}: ${review.resubmitted_file_name ?? "arquivo"}`} />
        )}
      </div>
      <RoundStatus review={review} perDay={perDay} />
      {children}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Student                                                             */
/* ------------------------------------------------------------------ */

function ResubmitForm({ groupId, project, review }: { groupId: string; project: ProjectBanner; review: Review }) {
  const qc = useQueryClient();
  const diagnose = useDiagnoseBanner(groupId);
  const copyToDrive = useServerFn(syncBannerToDrive);
  const [checklist, setChecklist] = useState<ChecklistState>({});
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const done = checklistComplete(checklist);

  async function send(file: File) {
    const problem = bannerFileProblem(file);
    if (problem) return void toast.error(problem);
    setBusy(true);
    try {
      const hash = await fileFingerprint(file);
      if (project.banner_file_hash && hash === project.banner_file_hash) {
        toast.error("Este arquivo é idêntico à versão anterior. Faça as correções pedidas antes de reenviar.");
        return;
      }
      const path = `${groupId}/v${review.round + 1}-${Date.now()}-${safeFileName(file.name)}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
      if (up.error) throw up.error;
      const { data: at, error } = await supabase.rpc("resubmit_banner", {
        _review_id: review.id,
        _path: path,
        _name: file.name,
        _hash: hash,
      });
      if (error) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw error;
      }
      await supabase.from("project_contributions").insert({
        project_id: project.id,
        student_id: (await supabase.auth.getUser()).data.user?.id ?? "",
        section_name: "banner_file_path",
        char_count_added: 1000,
      });
      const days = daysLate(review.resubmit_due_at, at ?? new Date().toISOString());
      const perDayMsg = days > 0 ? `Atraso de ${days} dia(s).` : "Dentro do prazo.";
      toast.success(`Versão ${review.round + 1} enviada em ${fmtDateTime(at)}. ${perDayMsg}`);
      setChecklist({});
      qc.invalidateQueries({ queryKey: ["group", groupId] });
      diagnose.mutate();
      copyToDrive({ data: { groupId } }).catch((e) => console.warn("Banner Drive copy failed", e));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 border-t border-border pt-3">
      <p className="text-sm font-medium text-foreground">Enviar a versão {review.round + 1} corrigida</p>
      <BannerChecklist idPrefix={`v${review.round + 1}-${review.id}`} value={checklist} onChange={setChecklist} />
      <input
        ref={input}
        type="file"
        accept="application/pdf,image/png,image/jpeg"
        className="hidden"
        aria-label="Nova versão do banner"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void send(f);
        }}
      />
      <Button type="button" onClick={() => input.current?.click()} disabled={!done || busy}>
        {busy ? <Loader2 className="animate-spin" /> : <Send />} Enviar versão {review.round + 1}
      </Button>
      <p className="text-xs text-muted-foreground">
        O PamLab registra a data e a hora do envio. Arquivos idênticos à versão anterior são recusados.
      </p>
    </div>
  );
}

/** Student side of the banner corrector: AI guidance (no scores) and the teacher's feedback rounds. */
export function StudentBannerCorrector({
  groupId,
  project,
  perDay,
}: {
  groupId: string;
  project: ProjectBanner;
  perDay: number;
}) {
  const guidance = useQuery(bannerGuidanceQuery(groupId));
  const reviews = [...(project.banner_reviews ?? [])].sort(byRoundDesc);
  const latest = guidance.data?.[0];
  const stale = !!latest && latest.file_path !== project.banner_file_path;

  return (
    <div className="mt-8 space-y-6 border-t border-border pt-6">
      {reviews.length > 0 && (
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <PenLine className="size-5 text-primary" /> Devolutiva da professora
          </h3>
          <ul className="space-y-3">
            {reviews.map((r) => (
              <ReviewCard key={r.id} review={r} perDay={perDay}>
                {!r.resubmitted_at && <ResubmitForm groupId={groupId} project={project} review={r} />}
              </ReviewCard>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Diagnóstico da IA</h3>
            <p className="text-sm text-muted-foreground">
              Pré-avaliação para a FETEC/MS e a FECITMS, comparando o banner com o projeto escrito. A professora faz a validação final.
            </p>
          </div>
          <DiagnoseButton
            groupId={groupId}
            hasFile={!!project.banner_file_path}
            label={latest && !stale ? "Refazer diagnóstico" : "Pedir diagnóstico"}
          />
        </div>
        <DiagnosisRunning groupId={groupId} />
        {stale && <p className="text-sm text-warning-foreground">O arquivo mudou depois deste diagnóstico. Peça um novo.</p>}
        {guidance.isPending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Carregando…
          </p>
        ) : latest ? (
          <DiagnosisView
            feedback={parseBannerFeedback(latest.feedback)}
            createdAt={latest.created_at}
            version={latest.version}
            fileName={latest.file_name}
          />
        ) : (
          <p className="text-sm italic text-muted-foreground">
            {project.banner_file_path ? "Ainda sem diagnóstico para este arquivo." : "Envie o arquivo do banner para receber o diagnóstico."}
          </p>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Teacher                                                             */
/* ------------------------------------------------------------------ */

const defaultDue = () => {
  const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  d.setHours(23, 59, 0, 0);
  return format(d, "yyyy-MM-dd'T'HH:mm");
};

function ReviewForm({
  groupId,
  project,
  existing,
  onDone,
}: {
  groupId: string;
  project: ProjectBanner;
  existing: Review | null;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [due, setDue] = useState(existing ? format(new Date(existing.resubmit_due_at), "yyyy-MM-dd'T'HH:mm") : defaultDue());
  const [file, setFile] = useState<File | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const save = useMutation({
    mutationFn: async () => {
      const dueAt = new Date(due);
      if (Number.isNaN(dueAt.getTime())) throw new Error("Escolha a data e a hora limite do reenvio.");
      if (!notes.trim() && !file && !existing?.annotated_file_path) throw new Error("Escreva as observações ou envie o banner corrigido.");
      let annotated: { annotated_file_path: string; annotated_file_name: string } | null = null;
      if (file) {
        const problem = bannerFileProblem(file);
        if (problem) throw new Error(problem);
        const path = `${groupId}/review-${Date.now()}-${safeFileName(file.name)}`;
        const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
        if (up.error) throw up.error;
        annotated = { annotated_file_path: path, annotated_file_name: file.name };
      }
      const fields = { notes: notes.trim(), resubmit_due_at: dueAt.toISOString(), ...(annotated ?? {}) };
      if (existing) {
        const { error } = await supabase.from("banner_reviews").update(fields).eq("id", existing.id);
        if (error) throw error;
        if (annotated && existing.annotated_file_path) await supabase.storage.from(BUCKET).remove([existing.annotated_file_path]);
      } else {
        const { error } = await supabase
          .from("banner_reviews")
          .insert({ ...fields, project_id: project.id, group_id: groupId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(existing ? "Devolutiva atualizada" : "Devolutiva enviada ao grupo");
      setFile(null);
      qc.invalidateQueries({ queryKey: ["group", groupId] });
      qc.invalidateQueries({ queryKey: ["teacher", "banners"] });
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/40 p-4">
      <div className="space-y-2">
        <Label htmlFor={`notes-${existing?.id ?? "new"}`}>Observações para o grupo</Label>
        <Textarea
          id={`notes-${existing?.id ?? "new"}`}
          rows={5}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ex.: Incluam a 3ª referência, aumentem a fonte dos Resultados e revisem o gráfico…"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Banner corrigido e anotado (opcional)</Label>
          <input
            ref={input}
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            className="hidden"
            aria-label="Banner corrigido"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
          <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
            <FileUp /> {file ? file.name : existing?.annotated_file_path ? "Trocar arquivo corrigido" : "Escolher arquivo"}
          </Button>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`due-${existing?.id ?? "new"}`}>Data e hora limite do reenvio</Label>
          <Input id={`due-${existing?.id ?? "new"}`} type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
      </div>
      <Button onClick={() => save.mutate()} disabled={save.isPending}>
        {save.isPending ? <Loader2 className="animate-spin" /> : <Send />} {existing ? "Salvar devolutiva" : "Enviar devolutiva ao grupo"}
      </Button>
    </div>
  );
}

/** Teacher side: AI diagnosis with suggested grade, grade validation and the V1 → V2 feedback rounds. */
export function TeacherBannerPanel({
  groupId,
  project,
  perDay,
  grade,
  delivered,
}: {
  groupId: string;
  project: ProjectBanner;
  perDay: number;
  grade: { score: number | string; feedback: string | null; is_reference_ten: boolean } | null;
  delivered: boolean;
}) {
  const qc = useQueryClient();
  const diagnoses = useQuery(bannerDiagnosesQuery(groupId));
  const reviews = [...(project.banner_reviews ?? [])].sort(byRoundDesc);
  const open = reviews.find((r) => !r.resubmitted_at) ?? null;
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const latest = diagnoses.data?.[0];
  const older = (diagnoses.data ?? []).slice(1);
  const stale = !!latest && latest.file_path !== project.banner_file_path;
  const version = reviews.filter((r) => r.resubmitted_at).length + 1;

  const validate = useMutation({
    mutationFn: async (score: number) => {
      const { error } = await supabase.from("grades").upsert(
        {
          group_id: groupId,
          trimester: 3,
          score,
          feedback: grade?.feedback ?? null,
          is_reference_ten: grade?.is_reference_ten ?? false,
        },
        { onConflict: "group_id,trimester" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Nota do banner (3º bimestre) validada");
      qc.invalidateQueries({ queryKey: ["group", groupId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (r: Review) => {
      const { error } = await supabase.from("banner_reviews").delete().eq("id", r.id);
      if (error) throw error;
      if (r.annotated_file_path) await supabase.storage.from(BUCKET).remove([r.annotated_file_path]);
    },
    onSuccess: () => {
      toast.success("Devolutiva cancelada");
      qc.invalidateQueries({ queryKey: ["group", groupId] });
      qc.invalidateQueries({ queryKey: ["teacher", "banners"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Diagnóstico da IA</h3>
            <p className="text-sm text-muted-foreground">
              Matriz 3,5 / 2,5 / 2,0 / 2,0. É só uma sugestão: a nota que vale é a que você valida ou digita. O grupo não vê os números.
            </p>
          </div>
          <DiagnoseButton
            groupId={groupId}
            hasFile={!!project.banner_file_path}
            label={latest && !stale ? "Refazer diagnóstico" : `Diagnosticar versão ${version}`}
          />
        </div>
        <DiagnosisRunning groupId={groupId} />
        {stale && <p className="text-sm text-muted-foreground">O grupo trocou o arquivo depois deste diagnóstico.</p>}
        {diagnoses.isPending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Carregando…
          </p>
        ) : latest ? (
          <>
            <DiagnosisView
              feedback={parseBannerFeedback(latest.feedback)}
              createdAt={latest.created_at}
              version={latest.version}
              fileName={latest.file_name}
              axes={(Array.isArray(latest.axes) ? latest.axes : []) as unknown as BannerAxisScore[]}
              total={Number(latest.total)}
            />
            <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted p-3 text-sm">
              <span>
                Nota do 3º bimestre lançada:{" "}
                <strong>{grade ? formatPoints(Number(grade.score)) : "nenhuma"}</strong>
              </span>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" disabled={validate.isPending}>
                    <CheckCircle2 /> Validar {formatPoints(Number(latest.total))} como nota do banner
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Validar a nota sugerida?</AlertDialogTitle>
                    <AlertDialogDescription>
                      A nota do 3º bimestre do grupo passa a ser {formatPoints(Number(latest.total))}
                      {grade ? ` (hoje: ${formatPoints(Number(grade.score))})` : ""}. Os descontos de atraso continuam sendo aplicados.
                      Você pode mudar depois na aba Notas.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => validate.mutate(Number(latest.total))}>Validar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            {older.length > 0 && (
              <ul className="space-y-1 text-sm text-muted-foreground">
                {older.map((d) => (
                  <li key={d.id}>
                    Versão {d.version} · {fmtDateTime(d.created_at)} · sugerida {formatPoints(Number(d.total))}
                    {d.critical && " · atenção crítica"}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="text-sm italic text-muted-foreground">
            {project.banner_file_path ? "Ainda sem diagnóstico." : "O grupo ainda não enviou o arquivo do banner."}
          </p>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Devolutiva e reenvio</h3>
            <p className="text-sm text-muted-foreground">
              Baixe a versão do grupo, envie o banner anotado e as observações e defina a data e a hora limite. Atraso no reenvio:
              Nota final = Nota bruta − (dias de atraso × {formatPoints(perDay)}).
            </p>
          </div>
          {!open && project.banner_file_path && !creating && (
            <Button variant="outline" onClick={() => setCreating(true)}>
              <PenLine /> Nova devolutiva da versão {version}
            </Button>
          )}
        </div>
        {!delivered && !open && (
          <p className="text-sm text-muted-foreground">O grupo ainda não entregou a etapa do banner; você já pode mandar uma devolutiva se quiser.</p>
        )}
        {project.banner_file_path && (
          <BannerFileLink path={project.banner_file_path} name={`Versão atual: ${project.banner_file_name ?? "arquivo"}`} />
        )}
        {creating && !open && (
          <ReviewForm groupId={groupId} project={project} existing={null} onDone={() => setCreating(false)} />
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
                    <Button size="sm" variant="ghost" onClick={() => remove.mutate(r)} disabled={remove.isPending}>
                      <Trash2 /> Cancelar devolutiva
                    </Button>
                  </div>
                )}
                {!r.resubmitted_at && editing && (
                  <ReviewForm groupId={groupId} project={project} existing={r} onDone={() => setEditing(false)} />
                )}
              </ReviewCard>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
