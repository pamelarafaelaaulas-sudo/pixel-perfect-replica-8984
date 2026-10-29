import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Hash, School } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { teacherNumberingQuery } from "@/lib/queries";
import { numberProjects, projectCode } from "@/lib/project-code";
import { plural } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/professora/numeracao")({
  head: () => ({
    meta: [
      { title: "Numeração dos trabalhos — PamLab" },
      { name: "description", content: "Escolha a turma que começa a contagem e numere todos os trabalhos a partir do 01." },
      { property: "og:title", content: "Numeração dos trabalhos — PamLab" },
      { property: "og:description", content: "Escolha a turma que começa a contagem e numere todos os trabalhos a partir do 01." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(teacherNumberingQuery),
  component: NumberingPage,
});

function savedOrder(classes: { id: string; code_order: number | null; created_at: string }[]) {
  return [...classes]
    .sort(
      (a, b) =>
        (a.code_order ?? Infinity) - (b.code_order ?? Infinity) || a.created_at.localeCompare(b.created_at),
    )
    .map((c) => c.id);
}

function NumberingPage() {
  const { data: classes } = useSuspenseQuery(teacherNumberingQuery);
  const qc = useQueryClient();
  const [order, setOrder] = useState<string[]>(() => savedOrder(classes));

  const byId = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const preview = useMemo(
    () =>
      numberProjects(
        classes.map((c) => ({
          id: c.id,
          created_at: c.created_at,
          groups: (c.groups ?? []).filter((g) => g.projects).map((g) => ({ id: g.id, created_at: g.created_at })),
        })),
        order,
      ),
    [classes, order],
  );
  const changed = classes.some((c) =>
    (c.groups ?? []).some((g) => g.projects && g.projects.code_number !== preview.get(g.id)),
  );
  const orderChanged = order.join() !== savedOrder(classes).join();

  const apply = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("renumber_projects", { _class_ids: order });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Numeração aplicada — os novos códigos já aparecem para os grupos");
      qc.invalidateQueries({ queryKey: ["teacher"] });
      qc.invalidateQueries({ queryKey: ["class"] });
      qc.invalidateQueries({ queryKey: ["group"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function move(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setOrder(next);
  }

  function startWith(id: string) {
    setOrder([id, ...order.filter((x) => x !== id)]);
  }

  return (
    <>
      <Link to="/professora" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Minhas turmas
      </Link>
      <PageHeader
        eyebrow="Painel da professora"
        title="Numeração dos trabalhos"
        description="Todas as suas turmas seguem uma só contagem, a partir do 01. Escolha a turma que começa e a ordem das outras; dentro de cada turma, vale a ordem de cadastro dos grupos."
        actions={
          classes.length > 0 && (
            <Button onClick={() => apply.mutate()} disabled={apply.isPending || (!changed && !orderChanged)}>
              <Hash /> {apply.isPending ? "Aplicando…" : "Aplicar numeração"}
            </Button>
          )
        }
      />

      {classes.length === 0 ? (
        <EmptyState icon={<School className="size-5" />} title="Nenhuma turma ainda" text="Crie uma turma para numerar os trabalhos." />
      ) : (
        <div className="space-y-4">
          {changed && (
            <p className="rounded-md border border-highlight bg-highlight/20 px-4 py-2 text-sm">
              Esta é uma prévia. Os códigos só mudam para os grupos quando você clicar em <strong>Aplicar numeração</strong>.
            </p>
          )}
          {order.map((id, i) => {
            const c = byId.get(id);
            if (!c) return null;
            const groups = [...(c.groups ?? [])]
              .filter((g) => g.projects)
              .sort((a, b) => (preview.get(a.id) ?? 0) - (preview.get(b.id) ?? 0));
            return (
              <section key={id} className="card-paper p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex size-8 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground">
                      {i + 1}
                    </span>
                    <div>
                      <h2 className="text-lg font-semibold leading-tight">{c.name}</h2>
                      <p className="text-sm text-muted-foreground">
                        Sigla {c.code_label ?? "não definida"} · {plural(groups.length, "trabalho", "trabalhos")}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {i > 0 && (
                      <Button size="sm" variant="outline" onClick={() => startWith(id)}>
                        Começar por esta turma
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" aria-label="Subir turma" disabled={i === 0} onClick={() => move(i, -1)}>
                      <ArrowUp />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Descer turma"
                      disabled={i === order.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      <ArrowDown />
                    </Button>
                  </div>
                </div>
                {groups.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">Nenhum grupo cadastrado.</p>
                ) : (
                  <ul className="mt-4 divide-y">
                    {groups.map((g) => {
                      const now = projectCode(g.projects!.area_code, c.code_label, g.projects!.code_number);
                      const next = projectCode(g.projects!.area_code, c.code_label, preview.get(g.id));
                      return (
                        <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                          <span>{g.group_name}</span>
                          <span className="flex items-center gap-2 font-mono">
                            {now !== next && now && <span className="text-muted-foreground line-through">{now}</span>}
                            <span className="rounded-md bg-highlight px-2 py-0.5 font-semibold text-highlight-foreground">
                              {next ?? "sem área"}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
          <p className="text-sm text-muted-foreground">
            Grupos novos recebem o próximo número da contagem. Se quiser reorganizar depois, volte aqui e aplique de novo.
          </p>
        </div>
      )}
    </>
  );
}
