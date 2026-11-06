import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Check, Clock, Loader2, RotateCcw, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DiaryTimeline } from "@/components/diary";
import { diaryEntriesQuery, diarySubmissionsQuery, groupResponsibilitiesQuery } from "@/lib/queries";
import { diarySubmissionProblems } from "@/lib/diary";
import { fmtDateTime } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { submitDiaryAutomatically } from "@/lib/diary-auto.functions";

type Entry = { id: string; student_id: string; entry_date: string; kind: string; content: string; created_at: string };
function snapshotEntries(raw: unknown): Entry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is Entry => !!v && typeof v === "object" && ["id", "student_id", "entry_date", "kind", "content", "created_at"].every((key) => typeof v[key] === "string"));
}

export function DiaryApproval({ groupId, teacher = false, nameOf }: { groupId: string; teacher?: boolean; nameOf: (id: string) => string }) {
  const { data: submissions } = useSuspenseQuery(diarySubmissionsQuery(groupId));
  const { data: entries } = useSuspenseQuery(diaryEntriesQuery(groupId));
  const { data: roles } = useSuspenseQuery(groupResponsibilitiesQuery(groupId));
  const [note, setNote] = useState("");
  const submitAutomatically = useServerFn(submitDiaryAutomatically);
  const qc = useQueryClient();
  const latest = submissions[0];
  const pending = latest?.status === "pending";
  const problems = diarySubmissionProblems({ leaderId: roles?.leader_student_id ?? null, diaryId: roles?.diary_student_id ?? null, entryCount: entries.length, pending });
  const action = useMutation({
    mutationFn: async (decision: "submit" | "auto" | "approve" | "return") => {
      if (decision === "submit" || decision === "auto") {
        await submitAutomatically({ data: { groupId, pendingId: decision === "auto" ? latest?.id : undefined } });
      } else {
        if (!latest) throw new Error("Nenhum diário enviado.");
        const { error } = await supabase.rpc("review_group_diary", { _submission_id: latest.id, _approve: decision === "approve", _note: note.trim() });
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["diary", "submissions", groupId] });
      setNote("");
      toast.success("Status do diário atualizado");
    },
    onError: async (error: Error) => {
      await qc.invalidateQueries({ queryKey: ["diary", "submissions", groupId] });
      toast.error(error.message);
    },
  });
  return <section className="mb-6 space-y-4 border-y border-border py-5" aria-label="Entrega do diário de bordo">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-semibold">Entrega do Diário de bordo</h2>
      <Badge variant={pending ? "warning" : latest?.status === "approved" ? "success" : latest?.status === "changes_requested" ? "destructive" : "muted"}>
        {pending ? <><Clock className="mr-1 size-3" /> Aguardando aprovação</> : latest?.status === "approved" ? latest.approval_source === "automatic" ? "Aprovado automaticamente" : "Diário aprovado" : latest?.status === "changes_requested" ? "Correções solicitadas" : "Em elaboração"}
      </Badge>
    </div>
    {latest && <div className="space-y-1 text-sm">
      <p>Enviado em {fmtDateTime(latest.submitted_at)} · {snapshotEntries(latest.entries_snapshot).length} registro(s)</p>
      <p>Líder neste envio: <strong>{nameOf(latest.leader_student_id)}</strong> · Responsável pelo diário: <strong>{nameOf(latest.diary_student_id)}</strong></p>
      {latest.reviewed_at && <p className="text-muted-foreground">Revisado em {fmtDateTime(latest.reviewed_at)}</p>}
      {latest.teacher_note && <p className="whitespace-pre-wrap break-words rounded-md bg-muted p-3">{latest.teacher_note}</p>}
      {latest.ai_feedback && <div className="space-y-2 border-l-4 border-primary pl-3"><h3 className="flex items-center gap-2 font-semibold"><Sparkles className="size-4 text-primary" /> Dicas da IA</h3><p className="whitespace-pre-wrap break-words">{latest.ai_feedback}</p></div>}
      {latest.ai_status === "unavailable" && <p className="text-muted-foreground">Dicas da IA indisponíveis neste envio. A aprovação por datas foi mantida.</p>}
    </div>}
    {!teacher && <>
      <Button disabled={action.isPending || (!pending && problems.length > 0)} onClick={() => action.mutate(pending ? "auto" : "submit")}>
        {action.isPending ? <Loader2 className="animate-spin" /> : <Send />} {action.isPending ? "Conferindo diário e preparando dicas…" : pending ? "Aprovar automaticamente este envio" : latest ? "Enviar atualização com aprovação automática" : "Enviar diário com aprovação automática"}
      </Button>
      {!pending && problems.length > 0 && <ul className="list-inside list-disc text-sm text-muted-foreground">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
    </>}
    {teacher && pending && <div className="space-y-3">
      <Textarea aria-label="Orientações sobre o diário" placeholder="Orientações para o grupo" value={note} onChange={(e) => setNote(e.target.value)} maxLength={5000} />
      <div className="flex flex-wrap gap-2">
        <Button disabled={action.isPending} onClick={() => action.mutate("approve")}><Check /> Aprovar diário</Button>
        <Button variant="outline" disabled={action.isPending || !note.trim()} onClick={() => action.mutate("return")}><RotateCcw /> Solicitar correções</Button>
      </div>
    </div>}
    {submissions.length > 0 && <details>
      <summary className="cursor-pointer text-sm font-medium text-primary">Histórico dos envios ({submissions.length})</summary>
      <div className="mt-4 space-y-6">{submissions.map((s) => <div key={s.id} className="space-y-3">
        <p className="text-sm font-semibold">{fmtDateTime(s.submitted_at)} · {s.status === "approved" ? "Aprovado" : s.status === "pending" ? "Aguardando aprovação" : "Correções solicitadas"}</p>
        {s.teacher_note && <p className="whitespace-pre-wrap text-sm">{s.teacher_note}</p>}
        {s.ai_feedback && <p className="whitespace-pre-wrap text-sm">{s.ai_feedback}</p>}
        <DiaryTimeline entries={snapshotEntries(s.entries_snapshot)} nameOf={nameOf} />
      </div>)}</div>
    </details>}
  </section>;
}