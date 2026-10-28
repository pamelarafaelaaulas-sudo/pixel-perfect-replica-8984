import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, EyeOff, Star } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { groupDetailQuery, meQuery, myPeerEvaluationsQuery } from "@/lib/queries";
import { BIMESTER_NUMBERS } from "@/lib/phases";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/aluno/avaliacao/$groupId")({
  head: () => ({
    meta: [
      { title: "Avaliar colegas — PamLab" },
      { name: "description", content: "Avaliação confidencial da colaboração dos colegas de grupo." },
      { property: "og:title", content: "Avaliar colegas — PamLab" },
      { property: "og:description", content: "Avaliação confidencial da colaboração dos colegas de grupo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async ({ context, params }) => {
    const [g] = await Promise.all([
      context.queryClient.ensureQueryData(groupDetailQuery(params.groupId)),
      context.queryClient.ensureQueryData(myPeerEvaluationsQuery(params.groupId, context.me.id)),
    ]);
    if (!g) throw notFound();
  },
  component: PeerEvaluationPage,
});

const SCORE_LABELS = ["", "Quase não participou", "Participou pouco", "Participou", "Participou bem", "Participou muito"];

function PeerEvaluationPage() {
  const { groupId } = Route.useParams();
  const { data: me } = useSuspenseQuery(meQuery);
  const { data: group } = useSuspenseQuery(groupDetailQuery(groupId));
  const { data: mine } = useSuspenseQuery(myPeerEvaluationsQuery(groupId, me!.id));
  const [trimester, setTrimester] = useState(1);

  if (!group) return null;
  const mates = (group.group_members ?? []).filter((m) => m.student_id !== me?.id);

  return (
    <>
      <Link
        to="/aluno/projeto/$groupId"
        params={{ groupId }}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {group.group_name}
      </Link>
      <PageHeader
        eyebrow="Avaliação entre colegas"
        title="Como foi a colaboração?"
        description={
          <span className="inline-flex items-center gap-2">
            <EyeOff className="size-4" /> Confidencial: só você e a professora veem estas respostas.
          </span>
        }
      />

      <Tabs value={String(trimester)} onValueChange={(v) => setTrimester(Number(v))} className="mb-6">
        <TabsList className="h-auto flex-wrap">
          {BIMESTER_NUMBERS.map((t) => (
            <TabsTrigger key={t} value={String(t)}>
              {t}º bimestre
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {mates.length === 0 ? (
        <p className="text-muted-foreground">Seu grupo ainda não tem outros integrantes.</p>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {mates.map((m) => (
            <EvaluationCard
              key={`${m.student_id}-${trimester}`}
              groupId={groupId}
              evaluatorId={me!.id}
              evaluatedId={m.student_id}
              name={m.profiles?.name ?? ""}
              trimester={trimester}
              existing={mine.find((e) => e.evaluated_student_id === m.student_id && e.trimester === trimester)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function EvaluationCard({
  groupId,
  evaluatorId,
  evaluatedId,
  name,
  trimester,
  existing,
}: {
  groupId: string;
  evaluatorId: string;
  evaluatedId: string;
  name: string;
  trimester: number;
  existing?: { score: number; feedback: string | null } | undefined;
}) {
  const qc = useQueryClient();
  const [score, setScore] = useState<number>(existing ? Number(existing.score) : 0);
  const [feedback, setFeedback] = useState(existing?.feedback ?? "");
  useEffect(() => {
    setScore(existing ? Number(existing.score) : 0);
    setFeedback(existing?.feedback ?? "");
  }, [existing]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("peer_evaluations").upsert(
        {
          group_id: groupId,
          evaluator_student_id: evaluatorId,
          evaluated_student_id: evaluatedId,
          trimester,
          score,
          feedback: feedback.trim() || null,
        },
        { onConflict: "evaluator_student_id,evaluated_student_id,trimester" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Avaliação de ${name.split(" ")[0]} salva`);
      qc.invalidateQueries({ queryKey: ["peer", "mine", groupId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="card-paper space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{name}</h2>
        {existing && <span className="text-xs text-success">Avaliado</span>}
      </div>
      <div>
        <div className="flex gap-1" role="radiogroup" aria-label={`Nota para ${name}`}>
          {[1, 2, 3, 4, 5].map((i) => (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={score === i}
              aria-label={`${i} — ${SCORE_LABELS[i]}`}
              onClick={() => setScore(i)}
              className="rounded-md p-1 transition-transform hover:scale-110"
            >
              <Star className={cn("size-7", i <= score ? "fill-highlight text-highlight" : "text-border")} />
            </button>
          ))}
        </div>
        <p className="mt-1 h-5 text-sm text-muted-foreground">{SCORE_LABELS[score]}</p>
      </div>
      <Textarea
        rows={3}
        placeholder="Comentário (opcional): como foi trabalhar com essa pessoa?"
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
      />
      <Button className="w-full" onClick={() => save.mutate()} disabled={score === 0 || save.isPending}>
        {existing ? "Atualizar avaliação" : "Enviar avaliação"}
      </Button>
    </div>
  );
}
