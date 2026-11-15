import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Award, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { assessDiary } from "@/lib/diary-evaluation.functions";
import { diarySubmissionsQuery } from "@/lib/queries";
import { DIARY_AXES } from "@/lib/diary-evaluation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const labels = { continuidade: "Continuidade", organizacao: "Organização", conteudo: "Conteúdo", reflexao: "Reflexão" };
export function TeacherDiaryAI({ groupId }: { groupId: string }) {
  const qc = useQueryClient();
  const assess = useServerFn(assessDiary);
  const submissions = useQuery(diarySubmissionsQuery(groupId));
  const latest = submissions.data?.[0];
  const reference = useQuery({ queryKey: ["diary", "gold"], queryFn: async () => {
    const r = await supabase.from("diary_gold_standards").select("*, groups(group_name)").maybeSingle();
    if (r.error) throw r.error;
    return r.data;
  } });
  const evaluations = useQuery({ queryKey: ["diary", "evaluations", groupId], queryFn: async () => {
    const r = await supabase.from("diary_ai_evaluations").select("*").eq("group_id", groupId).order("created_at", { ascending: false });
    if (r.error) throw r.error;
    return r.data;
  } });
  const evaluation = evaluations.data?.find(e => e.submission_id === latest?.id);
  const action = useMutation({ mutationFn: async (kind: "gold" | "remove" | "assess") => {
    if (kind === "remove") {
      if (!reference.data) return;
      const r = await supabase.from("diary_gold_standards").delete().eq("teacher_id", reference.data.teacher_id);
      if (r.error) throw r.error;
    } else {
      if (!latest) throw new Error("O grupo precisa enviar o diário primeiro.");
      if (kind === "gold") {
        const r = await supabase.rpc("set_diary_gold_standard", { _submission_id: latest.id });
        if (r.error) throw r.error;
      } else await assess({ data: { groupId, submissionId: latest.id } });
    }
  }, onSuccess: () => { qc.invalidateQueries({ queryKey: ["diary"] }); toast.success("Avaliação do diário atualizada"); }, onError: (e: Error) => { qc.invalidateQueries({ queryKey: ["diary"] }); toast.error(e.message); } });
  return <section className="space-y-4 border-b border-border pb-6" aria-label="Avaliação por IA e diário padrão ouro">
    <h2 className="flex items-center gap-2 text-xl font-semibold"><Award className="size-5 text-primary" /> Diário padrão ouro</h2>
    <p className="text-sm text-muted-foreground">{reference.data ? `Referência nota 10: ${reference.data.groups?.group_name ?? "Diário selecionado"}.` : "Nenhum diário de referência selecionado."}</p>
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={!latest || action.isPending || (!!latest && reference.data?.submission_id === latest.id)} onClick={() => action.mutate("gold")}><Award /> {latest && reference.data?.submission_id === latest.id ? "Este envio é o padrão ouro" : reference.data ? "Substituir padrão ouro por este diário" : "Eleger este diário como referência nota 10"}</Button>
      {reference.data && <Button variant="ghost" size="icon" aria-label="Remover padrão ouro" title="Remover padrão ouro" disabled={action.isPending} onClick={() => action.mutate("remove")}><X /></Button>}
      <Button disabled={!latest || action.isPending || !!evaluation} onClick={() => action.mutate("assess")}>{action.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />} {evaluation ? "Envio avaliado" : "Analisar fotos e gerar nota prévia"}</Button>
    </div>
    {(reference.isError || evaluations.isError) && <p className="text-sm text-destructive">Não foi possível carregar a avaliação do diário.</p>}
    {evaluation && <div className="space-y-3 border-l-4 border-primary pl-4">
      <div className="flex flex-wrap items-center gap-3"><h3 className="text-lg font-semibold">Nota prévia: {Number(evaluation.score).toLocaleString("pt-BR")} / 10</h3><Badge variant={evaluation.validated ? "success" : "warning"}>{evaluation.validated ? "Fotos validadas" : "Ajustes nas fotos"}</Badge></div>
      <p className="text-sm text-muted-foreground">Sugestão exclusiva da professora. A nota oficial permanece sob sua decisão.</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{DIARY_AXES.map(key => <div key={key}><p className="text-sm text-muted-foreground">{labels[key]}</p><p className="font-semibold">{evaluation.axes && typeof evaluation.axes === "object" && !Array.isArray(evaluation.axes) ? String(evaluation.axes[key] ?? "—") : "—"} / 10</p></div>)}</div>
      <p className="whitespace-pre-wrap text-sm">{evaluation.comparison}</p>
      {evaluation.reference_submission_id !== reference.data?.submission_id && <p className="text-sm text-muted-foreground">Esta avaliação preserva a referência utilizada no momento da análise.</p>}
    </div>}
  </section>;
}