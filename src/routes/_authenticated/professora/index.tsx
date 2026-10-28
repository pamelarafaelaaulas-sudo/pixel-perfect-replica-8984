import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Plus, School, Users, ArrowRight, ClipboardList, Palette, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { meQuery, teacherClassesQuery } from "@/lib/queries";
import { plural } from "@/lib/format";
import { TeacherInvitesDialog } from "@/components/teacher-invites";

export const Route = createFileRoute("/_authenticated/professora/")({
  head: () => ({
    meta: [
      { title: "Minhas turmas — PamLab" },
      { name: "description", content: "Turmas, grupos e prazos do projeto científico." },
      { property: "og:title", content: "Minhas turmas — PamLab" },
      { property: "og:description", content: "Turmas, grupos e prazos do projeto científico." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(teacherClassesQuery),
  component: TeacherHome,
});

function TeacherHome() {
  const { data: classes } = useSuspenseQuery(teacherClassesQuery);
  const { data: me } = useSuspenseQuery(meQuery);
  const firstName = me?.name.split(" ")[0] ?? "";

  return (
    <>
      <PageHeader
        eyebrow="Painel da professora"
        title={`Olá, ${firstName}`}
        description="Crie uma turma, compartilhe o código com os alunos e acompanhe cada grupo em todas as etapas."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/professora/alunos">
                <Users /> Alunos
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/professora/bimestres" search={{ b: 1 }}>
                <ClipboardList /> Notas do bimestre
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/professora/exportar">
                <FileSpreadsheet /> Exportar planilha
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/professora/banner" search={{}}>
                <Palette /> Modelo do banner
              </Link>
            </Button>
            <TeacherInvitesDialog />
            <NewClassDialog />
          </div>
        }
      />
      {classes.length === 0 ? (
        <EmptyState
          icon={<School className="size-5" />}
          title="Nenhuma turma ainda"
          text="Crie sua primeira turma. Os prazos de todas as etapas já vêm sugeridos e você pode ajustar depois."
          action={<NewClassDialog />}
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => {
            const groups = c.groups ?? [];
            const students = groups.reduce((s, g) => s + (g.group_members?.length ?? 0), 0);
            return (
              <Link
                key={c.id}
                to="/professora/turma/$classId"
                params={{ classId: c.id }}
                className="card-paper group flex flex-col gap-4 p-6 transition-all hover:-translate-y-0.5 hover:shadow-lift"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-2xl font-semibold leading-tight">{c.name}</h2>
                  <span className="rounded-md bg-highlight px-2 py-1 font-mono text-sm text-highlight-foreground">
                    {c.class_code}
                  </span>
                </div>
                <div className="flex gap-5 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="size-4" /> {plural(groups.length, "grupo", "grupos")}
                  </span>
                  <span>{plural(students, "aluno", "alunos")}</span>
                </div>
                <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-primary">
                  Abrir turma <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

function NewClassDialog() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { data: me } = useSuspenseQuery(meQuery);
  const create = useMutation({
    mutationFn: async (v: { name: string; penalty: number }) => {
      const { error } = await supabase
        .from("classes")
        .insert({ name: v.name, late_penalty_per_day: v.penalty, teacher_id: me!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Turma criada!");
      qc.invalidateQueries({ queryKey: ["teacher", "classes"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    create.mutate({
      name: String(f.get("name")).trim(),
      penalty: Number(String(f.get("penalty")).replace(",", ".")) || 0,
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> Nova turma
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Nova turma</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="name">Nome da turma</Label>
            <Input id="name" name="name" placeholder="Ex.: 2º ano B — 2026" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="penalty">Desconto por dia de atraso (pontos)</Label>
            <Input id="penalty" name="penalty" inputMode="decimal" defaultValue="0,5" />
          </div>
          <DialogFooter>
            <Button disabled={create.isPending}>Criar turma</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
