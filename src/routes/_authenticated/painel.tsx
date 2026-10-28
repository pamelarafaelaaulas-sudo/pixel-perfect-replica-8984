import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({
    meta: [
      { title: "Painel — PamLab" },
      { name: "description", content: "Seu painel no PamLab." },
      { property: "og:title", content: "Painel — PamLab" },
      { property: "og:description", content: "Seu painel no PamLab." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: ({ context }) => {
    throw redirect({ to: context.me.role === "teacher" ? "/professora" : "/aluno", replace: true });
  },
});
