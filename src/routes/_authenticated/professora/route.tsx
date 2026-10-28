import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/professora")({
  beforeLoad: ({ context }) => {
    if (context.me.role !== "teacher") throw redirect({ to: "/aluno", replace: true });
  },
  component: () => <Outlet />,
});
