import { ExternalLink } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import { PHASES, parseArticles } from "@/lib/phases";
import { BannerView } from "@/components/banner-stage";

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
        <p className="mt-4 text-sm font-semibold text-foreground">Aplicação ou intervenção social</p>
        <Text value={project.social_application} />
      </Section>
      <Section n={4} title="Projeto escrito">
        <div className="space-y-5">
          <div>
            <p className="font-display text-xl font-semibold text-foreground">{project.title?.trim() || "Sem título ainda"}</p>
            {(project.institution || project.area_subarea) && (
              <p className="text-sm text-muted-foreground">
                {[project.institution, project.area_subarea].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
          <Part title="Resumo" value={project.abstract}>
            {project.keywords?.trim() && (
              <p className="mt-2 text-sm">
                <strong>Palavras-chave:</strong> {project.keywords}
              </p>
            )}
          </Part>
          <Part title="Introdução" value={project.introduction} />
          <Part title="Objetivo geral" value={project.general_objective} />
          <Part title="Objetivos específicos" value={project.specific_objectives} />
          <Part title="Metodologia" value={project.methodology} />
          <Part title="Resultados e discussão" value={project.results_discussion} />
          <Part title="Conclusão" value={project.conclusion} />
          <Part title="Referências" value={project.references_list} />
        </div>
      </Section>
      <Section n={5} title="Banner">
        <BannerView canvaUrl={project.banner_canva_url} filePath={project.banner_file_path} fileName={project.banner_file_name} />
      </Section>
    </div>
  );
}

function Part({ title, value, children }: { title: string; value: string | null; children?: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      <Text value={value} />
      {children}
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
