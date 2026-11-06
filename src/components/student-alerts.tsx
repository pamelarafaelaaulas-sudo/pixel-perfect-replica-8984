import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, OctagonAlert } from "lucide-react";
import { groupDetailQuery, lastDiaryDateQuery } from "@/lib/queries";
import { studentAlerts, type AlertTone } from "@/lib/alerts";
import { ethicsProblems } from "@/lib/ethics";
import { cn } from "@/lib/utils";

const STYLE: Record<AlertTone, { box: string; icon: typeof AlertTriangle }> = {
  red: { box: "border-destructive/40 bg-destructive/10 text-destructive", icon: OctagonAlert },
  yellow: { box: "border-warning/50 bg-warning/15 text-foreground", icon: AlertTriangle },
  green: { box: "border-success/40 bg-success/10 text-success", icon: CheckCircle2 },
};

export function StudentAlerts({ groupId }: { groupId: string }) {
  const { data: g } = useQuery(groupDetailQuery(groupId));
  const { data: lastDiary } = useQuery(lastDiaryDateQuery(groupId));
  if (!g) return null;
  const p = Array.isArray(g.projects) ? g.projects[0] : g.projects;
  if (!p) return null;
  const cls = g.classes;
  const alerts = studentAlerts({
    now: new Date(),
    currentPhase: p.current_phase,
    schedules: cls?.schedules ?? [],
    submittedPhases: (p.phase_submissions ?? []).map((s) => s.phase_number),
    bannerReviews: p.banner_reviews ?? [],
    writtenReviews: p.written_reviews ?? [],
    lastDiaryDate: lastDiary ?? null,
    diaryRequired: p.current_phase > 1,
    ethicsHumanResearch: p.ethics_human_research,
    ethicsProblems: ethicsProblems({ ...p, ethics_form_template_url: cls?.ethics_form_template_url }).length,
    bannerGraded: (g.grades ?? []).some((x) => x.trimester === 3),
  });
  if (!alerts.length) return null;
  return (
    <section aria-label={`Avisos do grupo ${g.group_name}`} className="mb-6 space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Avisos · {g.group_name}</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {alerts.map((a, i) => {
          const S = STYLE[a.tone];
          return (
            <div key={i} className={cn("flex gap-3 rounded-xl border p-3", S.box)}>
              <S.icon className="mt-0.5 size-5 shrink-0" />
              <div>
                <p className="text-sm font-semibold">{a.title}</p>
                <p className="text-xs text-foreground/80">{a.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
