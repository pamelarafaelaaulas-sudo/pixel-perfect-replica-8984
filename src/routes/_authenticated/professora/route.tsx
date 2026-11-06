import { createFileRoute, Link, Outlet, redirect, useLocation } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/professora")({
  beforeLoad: ({ context }) => {
    if (context.me.role !== "teacher") throw redirect({ to: "/aluno", replace: true });
  },
  component: TeacherLayout,
});

function TeacherLayout() {
  const { pathname } = useLocation();
  const isHome = pathname.replace(/\/$/, "") === "/professora";

  return (
    <>
      {!isHome && (
        <div className="mb-6 print:hidden">
          <Button asChild variant="outline" size="sm">
            <Link to="/professora"><ArrowLeft /> Voltar ao início</Link>
          </Button>
        </div>
      )}
      <Outlet />
    </>
  );
}
