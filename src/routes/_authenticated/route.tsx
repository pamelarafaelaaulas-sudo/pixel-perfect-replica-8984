import { createFileRoute, Outlet, redirect, useNavigate, Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { meQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (!me) throw redirect({ to: "/auth" });
    return { me };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { data: me } = useSuspenseQuery(meQuery);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background bg-grid">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <Brand to="/painel" />
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight text-foreground">{me?.name}</p>
              <p className="text-xs text-muted-foreground">{me?.email}</p>
            </div>
            <Badge variant={me?.role === "teacher" ? "highlight" : "secondary"}>
              {me?.role === "teacher" ? "Professora" : "Aluno(a)"}
            </Badge>
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sair">
              <LogOut />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-6xl px-6 pb-10 text-xs text-muted-foreground">
        <Link to="/" className="hover:underline">
          PamLab
        </Link>
      </footer>
    </div>
  );
}
