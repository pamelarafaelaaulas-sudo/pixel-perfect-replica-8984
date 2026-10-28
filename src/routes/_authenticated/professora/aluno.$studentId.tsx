import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  Check,
  Clock,
  Lock,
  MessageCircle,
  SkipForward,
  Star,
} from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { scoreTone } from "@/components/ai-feedback";
import { cn } from "@/lib/utils";
import { studentReviewQuery, type StudentReview } from "@/lib/queries";
import { phaseMeta } from "@/lib/phases";
import { fmtDate, fmtDateTime, plural, whatsappLink } from "@/lib/format";
import { formatPoints, projectLateness, type PhaseInfo } from "@/lib/penalty";
import { latestPerPhase } from "@/lib/ai-score";
import { studentSummary } from "@/lib/student-review";

export const Route = createFileRoute("/_authenticated/professora/aluno/$studentId")({
  head: () => ({
    meta: [
      { title: "Revisão do aluno — Caderno de Projetos" },
      {
        name: "description",
        content: "Notas por etapa, total e histórico de atrasos de um aluno.",
      },
      { property: "og:title", content: "Revisão do aluno — Caderno de Projetos" },
      {
        property: "og:description",
        content: "Notas por etapa, total e histórico de atrasos de um aluno.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(studentReviewQuery(params.studentId));
    if (!data.profile) throw notFound();
  },
  component: StudentReviewPage,
});

function StudentReviewPage() {
  const { studentId } = Route.useParams();
  const { data } = useSuspenseQuery(studentReviewQuery(studentId));
  const profile = data.profile;
  if (!profile) return null;

  return (
    <>
      <Link
        to="/professora"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Minhas turmas
      </Link>
      <PageHeader
        eyebrow="Revisão antes de lançar o trimestre"
        title={profile.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-3">
            {profile.email}
            {profile.whatsapp && (
              <a
                href={whatsappLink(profile.whatsapp)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <MessageCircle className="size-3.5" /> {profile.whatsapp}
              </a>
            )}
          </span>
        }
      />

      {data.memberships.length === 0 ? (
        <EmptyState
          icon={<Clock className="size-5" />}
          title="Sem grupo"
          text="Este aluno ainda não entrou em nenhum grupo."
        />
      ) : (
        <div className="space-y-10">
          {data.memberships.map((m) =>
            m.groups ? (
              <GroupReview key={m.id} studentId={studentId} group={m.groups} data={data} />
            ) : null,
          )}
        </div>
      )}
    </>
  );
}

type ReviewData = StudentReview;
type Group = NonNullable<ReviewData["memberships"][number]["groups"]>;

function GroupReview({
  studentId,
  group,
  data,
}: {
  studentId: string;
  group: Group;
  data: ReviewData;
}) {
  const cls = group.classes;
  const project = group.projects;
  const perDay = Number(cls?.late_penalty_per_day ?? 0);
  const { phases, totalPenalty } = projectLateness({
    currentPhase: project?.current_phase ?? 1,
    schedules: cls?.schedules ?? [],
    submissions: project?.phase_submissions ?? [],
    perDay,
  });
  const aiLatest = latestPerPhase(data.aiEvaluations.filter((e) => e.groupId === group.id));
  const summary = studentSummary({
    phases,
    totalPenalty,
    aiByPhase: Object.fromEntries(
      Object.entries(aiLatest).map(([k, v]) => [Number(k), v.latest.overall]),
    ),
    grades: (group.grades ?? []).map((g) => ({ ...g, score: Number(g.score) })),
    peers: data.peers
      .filter((p) => p.group_id === group.id)
      .map((p) => ({ trimester: p.trimester, score: Number(p.score) })),
  });
  const contributions = project?.project_contributions ?? [];
  const groupChars = contributions.reduce((s, c) => s + c.char_count_added, 0);
  const mine = contributions
    .filter((c) => c.student_id === studentId)
    .reduce((s, c) => s + c.char_count_added, 0);
  const share = groupChars > 0 ? Math.round((mine / groupChars) * 100) : null;

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-2xl font-semibold">
          <Link
            to="/professora/grupo/$groupId"
            params={{ groupId: group.id }}
            className="hover:text-primary"
          >
            {group.group_name}
          </Link>{" "}
          <span className="text-base font-normal text-muted-foreground">· {cls?.name}</span>
        </h2>
        <p className="text-sm text-muted-foreground">
          {plural((group.group_members ?? []).length, "integrante", "integrantes")}
          {share !== null && ` · escreveu ${share}% do texto do grupo`}
        </p>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <Stat
          label="Média da IA nas etapas"
          value={summary.aiAverage === null ? "—" : formatPoints(summary.aiAverage)}
          tone={summary.aiAverage === null ? undefined : scoreTone(summary.aiAverage)}
        />
        <Stat
          label="Dias de atraso"
          value={String(summary.totalDaysLate)}
          tone={summary.totalDaysLate > 0 ? "text-destructive" : undefined}
        />
        <Stat
          label="Desconto total"
          value={summary.totalPenalty > 0 ? `−${formatPoints(summary.totalPenalty)}` : "0,0"}
          tone={summary.totalPenalty > 0 ? "text-destructive" : undefined}
          hint={`${formatPoints(perDay)} por dia`}
        />
        <Stat
          label="Média final lançada"
          value={summary.finalAverage === null ? "—" : formatPoints(summary.finalAverage)}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="card-paper overflow-x-auto p-0">
          <h3 className="px-5 pt-5 text-lg font-semibold">Etapas e atrasos</h3>
          <table className="mt-2 w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-5 py-2 font-medium">Etapa</th>
                <th className="px-3 py-2 font-medium">Prazo</th>
                <th className="px-3 py-2 font-medium">Entrega</th>
                <th className="px-3 py-2 text-right font-medium">Atraso</th>
                <th className="px-5 py-2 text-right font-medium">Nota IA</th>
              </tr>
            </thead>
            <tbody>
              {summary.phaseRows.map((p) => (
                <tr key={p.phase} className="border-b border-border last:border-0">
                  <td className="px-5 py-3">
                    <span className="font-mono text-xs text-muted-foreground">{p.phase}.</span>{" "}
                    {phaseMeta(p.phase).name}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">{fmtDate(p.dueDate)}</td>
                  <td className="px-3 py-3">
                    <Delivery p={p} />
                  </td>
                  <td className="px-3 py-3 text-right">
                    {p.daysLate > 0 ? (
                      <span className="font-medium text-destructive">
                        {plural(p.daysLate, "dia", "dias")} · −{formatPoints(p.penalty)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td
                    className={cn(
                      "px-5 py-3 text-right font-mono font-semibold",
                      p.ai !== null ? scoreTone(p.ai) : "text-muted-foreground",
                    )}
                  >
                    {p.ai !== null ? formatPoints(p.ai) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card-paper p-5">
          <h3 className="text-lg font-semibold">Trimestres</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Nota final = sua nota − desconto de atraso.
          </p>
          <ul className="space-y-3">
            {summary.trimesters.map((t) => (
              <li key={t.trimester} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{t.trimester}º trimestre</span>
                  {t.score === null ? (
                    <Badge variant="muted">Não lançada</Badge>
                  ) : (
                    <Badge variant="success">Lançada</Badge>
                  )}
                </div>
                {t.score !== null && (
                  <p className="mt-2 font-mono text-sm">
                    {formatPoints(t.score)}
                    {summary.totalPenalty > 0 && (
                      <span className="text-destructive">
                        {" "}
                        − {formatPoints(summary.totalPenalty)}
                      </span>
                    )}{" "}
                    = <strong className="text-base">{formatPoints(t.final ?? 0)}</strong>
                    {t.reference && (
                      <span className="ml-2 inline-flex items-center gap-1 font-sans text-xs text-primary">
                        <Award className="size-3.5" /> Referência
                      </span>
                    )}
                  </p>
                )}
                <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Star className="size-3.5" />
                  {t.peerAverage === null
                    ? "Sem avaliação dos colegas"
                    : `Colegas: ${formatPoints(t.peerAverage)} de 5 (${plural(t.peerCount, "avaliação", "avaliações")})`}
                </p>
                {t.launchedAt && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Lançada em {fmtDateTime(t.launchedAt)}
                  </p>
                )}
              </li>
            ))}
          </ul>
          <Link
            to="/professora/grupo/$groupId"
            params={{ groupId: group.id }}
            className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
          >
            Lançar ou ajustar notas do grupo →
          </Link>
        </div>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: string;
  hint?: string;
}) {
  return (
    <div className="card-paper p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-mono text-2xl font-semibold", tone ?? "text-foreground")}>
        {value}
      </p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Delivery({ p }: { p: PhaseInfo }) {
  const late = p.daysLate > 0;
  if (p.state === "delivered")
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1",
          late ? "text-warning-foreground" : "text-success",
        )}
      >
        {late ? (
          <AlertTriangle className="size-3.5 text-warning" />
        ) : (
          <Check className="size-3.5" />
        )}
        {fmtDateTime(p.submittedAt)}
      </span>
    );
  if (p.state === "in_progress")
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1",
          late ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {late ? <AlertTriangle className="size-3.5" /> : <Clock className="size-3.5" />}
        {late ? "Atrasada, não entregue" : "Em andamento"}
      </span>
    );
  if (p.state === "skipped")
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <SkipForward className="size-3.5" /> Liberada pela professora
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <Lock className="size-3.5" /> Não liberada
    </span>
  );
}
