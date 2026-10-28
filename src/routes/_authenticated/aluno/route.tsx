import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/aluno")({
  beforeLoad: ({ context }) => {
    if (context.me.role !== "student") throw redirect({ to: "/professora", replace: true });
  },
  component: () => <Outlet />,
});
