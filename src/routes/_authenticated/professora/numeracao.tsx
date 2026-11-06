import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Hash, School } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { teacherNumberingQuery } from "@/lib/queries";
import { AREAS, DEFAULT_AREA_ORDER, areaLabel, numberProjects, projectCode } from "@/lib/project-code";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { plural } from "@/lib/format";
import { NumberingSheetButton } from "@/components/sheet-downloads";

export const Route = createFileRoute("/_authenticated/professora/numeracao")({
  head: () => ({
    meta: [
      { title: "Numeração dos trabalhos — FECITI Flow" },
      { name: "description", content: "Escolha a turma que começa a contagem e numere todos os trabalhos a partir do 01." },
      { property: "og:title", content: "Numeração dos trabalhos — FECITI Flow" },
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
  const savedAreas = classes.find((c) => c.code_area_order?.length)?.code_area_order ?? null;
  const [byArea, setByArea] = useState(!!savedAreas);
  const [areaOrder, setAreaOrder] = useState<string[]>(() => {
    const base = savedAreas ?? DEFAULT_AREA_ORDER;
    return [...base, ...AREAS.map((a) => a.code).filter((c) => !base.includes(c))];
  });
  const activeAreas = byArea ? areaOrder : null;

  const byId = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const preview = useMemo(
    () =>
      numberProjects(
        classes.map((c) => ({
          id: c.id,
          created_at: c.created_at,
          groups: (c.groups ?? []).filter((g) => g.projects).map((g) => ({ id: g.id, created_at: g.created_at, area_code: g.projects?.area_code ?? null })),
        })),
        order,
        activeAreas,
      ),
    [classes, order, activeAreas],
  );
  const changed = classes.some((c) =>
    (c.groups ?? []).some((g) => g.projects && g.projects.code_number !== preview.get(g.id)),
  );
  const orderChanged =
    order.join() !== savedOrder(classes).join() || (activeAreas ?? []).join() !== (savedAreas ?? []).join();
  const flat = useMemo(
    () =>
      classes
        .flatMap((c) => (c.groups ?? []).filter((g) => g.projects).map((g) => ({ g, c })))
        .sort((a, b) => (preview.get(a.g.id) ?? 0) - (preview.get(b.g.id) ?? 0)),
    [classes, preview],
  );
  function moveArea(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= areaOrder.length) return;
    const next = [...areaOrder];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setAreaOrder(next);
  }

  const apply = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("renumber_projects", { _class_ids: order, _area_codes: activeAreas ?? [] });
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
      <PageHeader
        eyebrow="Painel da professora"
        title="Numeração dos trabalhos"
        description="Todas as suas turmas seguem uma só contagem, a partir do 01. Escolha a turma que começa e a ordem das outras; dentro de cada turma, vale a ordem de cadastro dos grupos."
        actions={
          classes.length > 0 && (
            <div className="flex flex-wrap gap-2">
            <NumberingSheetButton />
            <Button onClick={() => apply.mutate()} disabled={apply.isPending || (!changed && !orderChanged)}>
              <Hash /> {apply.isPending ? "Aplicando…" : "Aplicar numeração"}
            </Button>
            </div>
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
          <section className="card-paper space-y-4 p-5">
            <div className="flex items-center gap-3">
              <Switch id="by-area" checked={byArea} onCheckedChange={setByArea} />
              <Label htmlFor="by-area" className="text-base font-semibold">Agrupar por área</Label>
            </div>
            <p className="text-sm text-muted-foreground">
              A contagem continua única (01, 02, 03…), mas os trabalhos da mesma área ficam juntos, na ordem abaixo.
              Dentro de cada área vale a ordem das turmas e, depois, a ordem de cadastro dos grupos. Grupos sem área ficam no final.
            </p>
            {byArea && (
              <ol className="grid gap-1 sm:grid-cols-2">
                {areaOrder.map((code, i) => (
                  <li key={code} className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm">
                    <span><span className="mr-2 font-semibold text-primary">{i + 1}.</span>{areaLabel(code)} <span className="font-mono text-muted-foreground">({code})</span></span>
                    <span className="flex">
                      <Button size="icon" variant="ghost" aria-label={`Subir ${areaLabel(code)}`} disabled={i === 0} onClick={() => moveArea(i, -1)}><ArrowUp /></Button>
                      <Button size="icon" variant="ghost" aria-label={`Descer ${areaLabel(code)}`} disabled={i === areaOrder.length - 1} onClick={() => moveArea(i, 1)}><ArrowDown /></Button>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
          {byArea && flat.length > 0 && (
            <section className="card-paper p-5">
              <h2 className="text-lg font-semibold">Ordem final por área</h2>
              <ul className="mt-3 divide-y">
                {flat.map(({ g, c }, i) => {
                  const area = g.projects!.area_code;
                  const prev = i > 0 ? flat[i - 1]!.g.projects!.area_code : undefined;
                  return (
                    <li key={g.id} className="py-2 text-sm">
                      {area !== prev && (
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">{areaLabel(area) ?? "Sem área definida"}</p>
                      )}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>{g.group_name} <span className="text-muted-foreground">· {c.name}</span></span>
                        <span className="rounded-md bg-highlight px-2 py-0.5 font-mono font-semibold text-highlight-foreground">
                          {projectCode(area, c.code_label, preview.get(g.id)) ?? "sem área"}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          <h2 className="pt-2 text-lg font-semibold">Ordem das turmas</h2>
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
