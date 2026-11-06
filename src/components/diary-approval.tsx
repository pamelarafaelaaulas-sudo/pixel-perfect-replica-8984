import { useState } from "react";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Check, Clock, Loader2, RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DiaryTimeline } from "@/components/diary";
import { diaryEntriesQuery, diarySubmissionsQuery, groupResponsibilitiesQuery } from "@/lib/queries";
import { diarySubmissionProblems } from "@/lib/diary";
import { fmtDateTime } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";

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
  const qc = useQueryClient();
  const latest = submissions[0];
  const pending = latest?.status === "pending";
  const problems = diarySubmissionProblems({ leaderId: roles?.leader_student_id ?? null, diaryId: roles?.diary_student_id ?? null, entryCount: entries.length, pending });
  const action = useMutation({
    mutationFn: async (decision: "submit" | "approve" | "return") => {
      if (decision === "submit") {
        const { error } = await supabase.rpc("submit_group_diary", { _group_id: groupId });
        if (error) throw error;
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
    onError: (error: Error) => toast.error(error.message),
  });
  return <section className="mb-6 space-y-4 border-y border-border py-5" aria-label="Entrega do diário de bordo">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-semibold">Entrega do Diário de bordo</h2>
      <Badge variant={pending ? "warning" : latest?.status === "approved" ? "success" : latest?.status === "changes_requested" ? "destructive" : "muted"}>
        {pending ? <><Clock className="mr-1 size-3" /> Aguardando aprovação da professora</> : latest?.status === "approved" ? "Diário aprovado" : latest?.status === "changes_requested" ? "Correções solicitadas" : "Em elaboração"}
      </Badge>
    </div>
    {latest && <div className="space-y-1 text-sm">
      <p>Enviado em {fmtDateTime(latest.submitted_at)} · {snapshotEntries(latest.entries_snapshot).length} registro(s)</p>
      <p>Líder neste envio: <strong>{nameOf(latest.leader_student_id)}</strong> · Responsável pelo diário: <strong>{nameOf(latest.diary_student_id)}</strong></p>
      {latest.reviewed_at && <p className="text-muted-foreground">Revisado em {fmtDateTime(latest.reviewed_at)}</p>}
      {latest.teacher_note && <p className="whitespace-pre-wrap break-words rounded-md bg-muted p-3">{latest.teacher_note}</p>}
    </div>}
    {!teacher && <>
      <Button disabled={action.isPending || problems.length > 0} onClick={() => action.mutate("submit")}>
        {action.isPending ? <Loader2 className="animate-spin" /> : <Send />} {latest ? "Enviar nova atualização para aprovação" : "Enviar diário para aprovação"}
      </Button>
      {problems.length > 0 && <ul className="list-inside list-disc text-sm text-muted-foreground">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
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
        <DiaryTimeline entries={snapshotEntries(s.entries_snapshot)} nameOf={nameOf} />
      </div>)}</div>
    </details>}
  </section>;
}