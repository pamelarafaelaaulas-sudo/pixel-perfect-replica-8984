import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, BookOpenText, FlaskConical, Lightbulb, Medal, PenLine, Presentation, Sparkles, Trophy, Users } from "lucide-react";
import logo from "@/assets/feciti-flow-logo.png.asset.json";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FECITI Flow — Projeto científico da turma" },
      {
        name: "description",
        content:
          "Grupos de até 3 alunos constroem o projeto científico etapa por etapa, com prazos, banner no Canva, feira, avaliação entre colegas e notas nos 4 bimestres.",
      },
      { property: "og:title", content: "FECITI Flow — Projeto científico da turma" },
      {
        property: "og:description",
        content: "Tema, artigos, pergunta norteadora, projeto escrito, banner e feira — tudo no FECITI Flow.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

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
          <Link to={signedIn ? "/painel" : "/auth"}>
            <span key={signedIn ? "in" : "out"}>{signedIn ? "Ir para o painel" : "Entrar"}</span>
          </Link>
        </Button>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-24">
        <section className="grid gap-12 pt-8 md:grid-cols-[1.2fr_1fr] md:items-center md:pt-14">
          <div>
            <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-highlight px-3 py-1 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-highlight-foreground">
              <FlaskConical className="size-3.5" /> Iniciação científica & feiras
            </p>
            <h1 className="text-5xl font-semibold leading-[1.05] text-foreground md:text-6xl">
              Transformando a <span className="text-brand-gradient">curiosidade</span> em ciência, juntos.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">
              Monte a sua equipe de até 3 integrantes e desenvolva seu projeto passo a passo — da escrita do texto à apresentação do banner na feira. Acompanhe os prazos, colabore com seu grupo e construa sua nota bimestre a bimestre.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="shadow-lift">
                <Link to={signedIn ? "/painel" : "/auth"}>
                  <span key={signedIn ? "in" : "out"}>{signedIn ? "Abrir o FECITI Flow" : "Começar agora"}</span> <ArrowRight />
                </Link>
              </Button>
            </div>
          </div>

          <figure className="relative mx-auto w-full max-w-md">
            <div aria-hidden className="absolute -inset-4 rotate-3 rounded-[2rem] bg-brand-gradient opacity-90" />
            <img
              src={logo.url}
              alt="Logo FECITI Flow — Iniciação & Feiras"
              width={435}
              height={330}
              className="relative z-10 w-full -rotate-1 rounded-3xl bg-card p-5 shadow-lift"
            />
            {[
              { icon: FlaskConical, text: "Iniciação científica", cls: "-left-6 top-4 bg-info text-info-foreground", delay: "0s" },
              { icon: Presentation, text: "Banner no Canva", cls: "-right-4 top-1/2 bg-highlight text-highlight-foreground", delay: "1.2s" },
              { icon: Trophy, text: "Pódio & medalhas", cls: "-bottom-6 left-6 bg-primary text-primary-foreground", delay: "2.4s" },
            ].map(({ icon: I, text, cls, delay }) => (
              <span
                key={text}
                style={{ animationDelay: delay }}
                className={`animate-float absolute z-20 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold shadow-lift ${cls}`}
              >
                <I className="size-4" /> {text}
              </span>
            ))}
          </figure>
        </section>

        <section className="mt-28">
          <h2 className="mb-2 text-3xl font-semibold">A jornada do ano</h2>
          <p className="mb-6 text-muted-foreground">Quatro bimestres, um projeto completo.</p>
          <ol className="grid gap-4 md:grid-cols-4">
            {[
              { icon: Lightbulb, b: "1º bimestre", t: "Tema, artigos e pergunta", d: "Da curiosidade à pergunta norteadora, com fichamento dos artigos.", cls: "bg-primary text-primary-foreground" },
              { icon: PenLine, b: "2º bimestre", t: "Escrita científica", d: "Introdução, resultados, referências e resumo com citações ABNT.", cls: "bg-info text-info-foreground" },
              { icon: Presentation, b: "3º bimestre", t: "Banner e diário", d: "Banner no Canva com devolutiva da professora e diário de bordo.", cls: "bg-highlight text-highlight-foreground" },
              { icon: Trophy, b: "4º bimestre", t: "Feira FECITI", d: "Apresentação, avaliação e premiação dos projetos.", cls: "bg-brand-gradient text-primary-foreground" },
            ].map(({ icon: I, b, t, d, cls }) => (
              <li key={b} className={`rounded-2xl p-5 shadow-lift transition-transform hover:-translate-y-1 ${cls}`}>
                <I className="size-7" />
                <p className="mt-4 font-mono text-xs uppercase tracking-[0.2em] opacity-80">{b}</p>
                <h3 className="mt-1 text-xl font-semibold">{t}</h3>
                <p className="mt-2 text-sm opacity-90">{d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-20 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Users, title: "Equipes de até 3", text: "Entre na turma pelo código e forme seu grupo.", cls: "bg-primary/15 text-primary" },
            { icon: Sparkles, title: "Dicas da IA", text: "Sugestões para melhorar a escrita e as citações.", cls: "bg-info/15 text-info" },
            { icon: Medal, title: "Medalhas digitais", text: "Ganhe ouro, prata e bronze entregando no prazo.", cls: "bg-highlight/40 text-highlight-foreground" },
            { icon: BookOpenText, title: "Prazos sempre à vista", text: "Avisos coloridos e contagem regressiva da feira.", cls: "bg-primary/15 text-primary" },
          ].map(({ icon: Icon, title, text, cls }) => (
            <div key={title} className="card-paper p-6 transition-transform hover:-translate-y-1">
              <span className={`grid size-11 place-items-center rounded-xl ${cls}`}>
                <Icon className="size-5" />
              </span>
              <h3 className="mt-4 text-lg font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
