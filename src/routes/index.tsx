import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, BookOpenText, FlaskConical, HelpCircle, Lightbulb, PenLine, Presentation, Users } from "lucide-react";
import caricature from "@/assets/pamela-caricatura.png";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { PHASES, WRITTEN_END, WRITTEN_START } from "@/lib/phases";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PamLab — Projeto científico da turma" },
      {
        name: "description",
        content:
          "Grupos de até 3 alunos constroem o projeto científico etapa por etapa, com prazos, banner no Canva, feira, avaliação entre colegas e notas nos 4 bimestres.",
      },
      { property: "og:title", content: "PamLab — Projeto científico da turma" },
      {
        property: "og:description",
        content: "Tema, artigos, pergunta norteadora, projeto escrito, banner e feira — tudo no PamLab.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const ICONS = [Lightbulb, BookOpenText, HelpCircle, PenLine, Presentation];

function Index() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);

  return (
    <div className="min-h-screen bg-background bg-grid">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Brand />
        <Button asChild variant={signedIn ? "default" : "outline"}>
          <Link to={signedIn ? "/painel" : "/auth"}>{signedIn ? "Ir para o painel" : "Entrar"}</Link>
        </Button>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-24">
        <section className="grid gap-10 pt-10 md:grid-cols-[1.25fr_1fr] md:items-center md:pt-16">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 font-mono text-xs uppercase tracking-[0.2em] text-secondary-foreground">
              <FlaskConical className="size-3.5" /> Projeto científico escolar
            </p>
            <h1 className="text-5xl font-semibold leading-[1.05] text-foreground md:text-6xl">
              Da curiosidade à <span className="marker">pergunta científica</span>, em grupo.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">
              Os alunos formam grupos de até 3 integrantes, escrevem o projeto etapa por etapa, montam o
              banner e apresentam na feira. A professora acompanha prazos, vê quem contribuiu e lança as
              notas de cada bimestre.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to={signedIn ? "/painel" : "/auth"}>
                  {signedIn ? "Abrir o PamLab" : "Começar agora"} <ArrowRight />
                </Link>
              </Button>
            </div>
          </div>

          <figure className="relative mx-auto flex w-full max-w-sm justify-center md:max-w-none">
            <div aria-hidden className="absolute bottom-6 left-1/2 size-72 -translate-x-1/2 rounded-full bg-brand-gradient opacity-90 md:size-80" />
            <div aria-hidden className="absolute bottom-48 left-[12%] size-20 rounded-full bg-highlight md:left-[16%]" />
            <div aria-hidden className="absolute right-[14%] top-10 size-10 rounded-full border-4 border-info" />
            <img
              src={caricature}
              alt="Caricatura da professora Pâmela segurando um troféu e usando medalhas"
              width={270}
              height={900}
              className="relative z-10 h-[440px] w-auto drop-shadow-xl md:h-[520px]"
            />
            <figcaption className="absolute -bottom-5 right-0 z-20 rotate-2 rounded-xl bg-highlight px-4 py-2 font-display text-lg font-semibold text-highlight-foreground shadow-lift">
              Bem-vindos ao PamLab!
            </figcaption>
          </figure>
        </section>

        <section className="mt-20">
          <h2 className="mb-4 text-3xl font-semibold">O caminho do projeto</h2>
          <ol className="card-paper relative grid gap-1 p-6 md:grid-cols-2">
            {[
              ...PHASES.filter((p) => p.number < WRITTEN_START),
              {
                number: WRITTEN_START,
                name: "Projeto escrito",
                hint: `${WRITTEN_END - WRITTEN_START + 1} partes com prazo próprio: título, objetivos, metodologia, introdução, resultados, conclusão, referências e, por último, o resumo.`,
              },
              { number: WRITTEN_START + 1, name: "Banner e feira", hint: "No 3º bimestre, o banner montado no Canva; no 4º, a apresentação na feira." },
            ].map((p, i) => {
              const Icon = ICONS[i] ?? Lightbulb;
              return (
                <li key={p.number} className="flex gap-4 rounded-lg p-3 transition-colors hover:bg-muted">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-primary/30 font-display text-lg font-semibold text-primary">
                    {p.number}
                  </span>
                  <div>
                    <p className="flex items-center gap-2 font-medium text-foreground">
                      <Icon className="size-4 text-primary" /> {p.name}
                    </p>
                    <p className="text-sm text-muted-foreground">{p.hint}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="mt-24 grid gap-6 md:grid-cols-3">
          {[
            {
              icon: Users,
              title: "Grupos de até 3",
              text: "Cada aluno entra na turma pelo código e forma ou entra num grupo.",
            },
            {
              icon: PenLine,
              title: "Quem escreveu o quê",
              text: "Cada edição fica registrada por aluno e por seção do projeto.",
            },
            {
              icon: BookOpenText,
              title: "Avaliação entre colegas",
              text: "Confidencial: só quem avaliou e a professora conseguem ver.",
            },
          ].map(({ icon: Icon, title, text }, i) => (
            <div key={title} className="card-paper p-6">
              <span
                className={[
                  "grid size-10 place-items-center rounded-full",
                  ["bg-primary text-primary-foreground", "bg-info text-info-foreground", "bg-highlight text-highlight-foreground"][i % 3],
                ].join(" ")}
              >
                <Icon className="size-5" />
              </span>
              <h3 className="mt-3 text-xl font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
