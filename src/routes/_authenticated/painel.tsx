import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({
    meta: [
      { title: "Painel — Caderno de Projetos" },
      { name: "description", content: "Seu painel no Caderno de Projetos." },
      { property: "og:title", content: "Painel — Caderno de Projetos" },
      { property: "og:description", content: "Seu painel no Caderno de Projetos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: ({ context }) => {
    throw redirect({ to: context.me.role === "teacher" ? "/professora" : "/aluno", replace: true });
  },
});
