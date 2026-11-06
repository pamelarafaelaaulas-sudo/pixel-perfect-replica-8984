import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, MessageSquareText } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { DiaryEntryForm, DiaryTimeline, StatsLine } from "@/components/diary";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { diaryEntriesQuery, diaryGradesQuery, groupDetailQuery, meQuery } from "@/lib/queries";
import { diaryStats, diaryToday } from "@/lib/diary";
import { formatPoints } from "@/lib/penalty";
import { fmtDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/aluno/diario/$groupId")({
  head: () => ({
    meta: [
      { title: "Diário de bordo — FECITI Flow" },
      { name: "description", content: "Registros datados da pesquisa: acertos, erros e mudanças de rota do grupo." },
      { property: "og:title", content: "Diário de bordo — FECITI Flow" },
      { property: "og:description", content: "Registros datados da pesquisa: acertos, erros e mudanças de rota do grupo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async ({ context, params }) => {
    const [g] = await Promise.all([
      context.queryClient.ensureQueryData(groupDetailQuery(params.groupId)),
      context.queryClient.ensureQueryData(diaryEntriesQuery(params.groupId)),
      context.queryClient.ensureQueryData(diaryGradesQuery(params.groupId)),
    ]);
    if (!g) throw notFound();
  },
  component: DiaryPage,
});

function DiaryPage() {
  const { groupId } = Route.useParams();
  const { data: me } = useSuspenseQuery(meQuery);
  const { data: group } = useSuspenseQuery(groupDetailQuery(groupId));
  const { data: entries } = useSuspenseQuery(diaryEntriesQuery(groupId));
  const { data: grades } = useSuspenseQuery(diaryGradesQuery(groupId));
  const [view, setView] = useState<"meus" | "grupo">("meus");
  if (!group || !me) return null;
  const members = group.group_members ?? [];
  const nameOf = (id: string) => members.find((m) => m.student_id === id)?.profiles?.name ?? "Ex-integrante";
  const mine = entries.filter((e) => e.student_id === me.id);
  const grade = grades.find((g) => g.student_id === me.id);

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
        eyebrow="Diário de bordo"
        title="Registros da pesquisa"
        description="Anote com frequência, com data e com honestidade: o que deu certo, o que deu errado e o que mudou. A professora avalia o diário no 3º bimestre."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section className="card-paper space-y-5 p-6">
          <StatsLine s={diaryStats(mine, diaryToday())} />
          <Tabs value={view} onValueChange={(v) => setView(v as "meus" | "grupo")}>
            <TabsList>
              <TabsTrigger value="meus">Meus registros</TabsTrigger>
              <TabsTrigger value="grupo">Todo o grupo</TabsTrigger>
            </TabsList>
          </Tabs>
          <DiaryTimeline entries={view === "meus" ? mine : entries} nameOf={view === "grupo" ? nameOf : undefined} />
        </section>

        <aside className="space-y-4">
          <DiaryEntryForm groupId={groupId} studentId={me.id} />
          <div className="card-paper space-y-2 p-5">
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <MessageSquareText className="size-5 text-primary" /> Avaliação da professora
            </h3>
            {grade ? (
              <>
                <p className="font-display text-2xl font-semibold">{formatPoints(Number(grade.score))}</p>
                {grade.feedback && <p className="whitespace-pre-wrap text-sm text-foreground">{grade.feedback}</p>}
                <p className="text-xs text-muted-foreground">Atualizada em {fmtDateTime(grade.updated_at)}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Ainda não avaliado. A avaliação acontece no 3º bimestre.</p>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
