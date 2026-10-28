import { ExternalLink } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import { PHASES, WRITTEN_SECTIONS, parseArticles } from "@/lib/phases";

type Project = Database["public"]["Tables"]["projects"]["Row"];

function Empty() {
  return <p className="text-sm italic text-muted-foreground">Ainda não preenchido.</p>;
}

function Text({ value }: { value: string | null }) {
  if (!value?.trim()) return <Empty />;
  return <p className="whitespace-pre-wrap leading-relaxed text-foreground">{value}</p>;
}

export function ProjectView({ project }: { project: Project }) {
  const articles = parseArticles(project.scientific_articles);
  return (
    <div className="space-y-8">
      <Section n={1} title={PHASES[0].name}>
        <Text value={project.theme} />
      </Section>
      <Section n={2} title={PHASES[1].name}>
        {articles.length === 0 ? (
          <Empty />
        ) : (
          <ol className="space-y-3">
            {articles.map((a, i) => (
              <li key={i} className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{a.title || "Sem título"}</p>
                  <span className="text-xs text-muted-foreground">{a.source_type}</span>
                </div>
                {a.url && (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 break-all text-sm text-primary hover:underline"
                  >
                    {a.url} <ExternalLink className="size-3" />
                  </a>
                )}
                {a.abnt_citation && <p className="mt-2 text-sm text-muted-foreground">{a.abnt_citation}</p>}
              </li>
            ))}
          </ol>
        )}
      </Section>
      <Section n={3} title={PHASES[2].name}>
        <Text value={project.guiding_question} />
      </Section>
      <Section n={4} title={PHASES[3].name}>
        <div className="space-y-5">
          {WRITTEN_SECTIONS.map((s) => (
            <div key={s.key}>
              <h4 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{s.label}</h4>
              <Text value={project[s.key]} />
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 flex items-baseline gap-2 text-xl font-semibold">
        <span className="font-mono text-sm text-muted-foreground">{n}.</span> {title}
      </h3>
      {children}
    </section>
  );
}
