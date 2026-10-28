import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, BookOpenText, HelpCircle, Lightbulb, PenLine, Users } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { PHASES } from "@/lib/phases";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Caderno de Projetos — Projeto científico da turma" },
      {
        name: "description",
        content:
          "Grupos de até 3 alunos constroem o projeto científico em 4 etapas, com prazos, avaliação entre colegas e notas por trimestre.",
      },
      { property: "og:title", content: "Caderno de Projetos — Projeto científico da turma" },
      {
        property: "og:description",
        content: "Tema, artigos, pergunta norteadora e projeto escrito — tudo num só caderno.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const ICONS = [Lightbulb, BookOpenText, HelpCircle, PenLine];

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
        <section className="grid gap-12 pt-10 md:grid-cols-[1.2fr_1fr] md:items-center md:pt-20">
          <div>
            <p className="mb-4 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Projeto científico escolar
            </p>
            <h1 className="text-5xl font-semibold leading-[1.05] text-foreground md:text-6xl">
              Da curiosidade à <span className="marker">pergunta científica</span>, em grupo.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">
              Os alunos formam grupos de até 3 integrantes e escrevem o projeto em quatro etapas. A
              professora acompanha prazos, vê quem contribuiu e lança as notas do trimestre.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to={signedIn ? "/painel" : "/auth"}>
                  {signedIn ? "Abrir meu caderno" : "Começar agora"} <ArrowRight />
                </Link>
              </Button>
            </div>
          </div>

          <ol className="card-paper relative space-y-1 p-6">
            {PHASES.map((p, i) => {
              const Icon = ICONS[i];
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
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="card-paper p-6">
              <Icon className="size-5 text-primary" />
              <h3 className="mt-3 text-xl font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
