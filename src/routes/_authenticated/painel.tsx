import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({
    meta: [
      { title: "Painel — FECITI Flow" },
      { name: "description", content: "Seu painel no FECITI Flow." },
      { property: "og:title", content: "Painel — FECITI Flow" },
      { property: "og:description", content: "Seu painel no FECITI Flow." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: ({ context }) => {
    throw redirect({ to: context.me.role === "teacher" ? "/professora" : "/aluno", replace: true });
  },
});
