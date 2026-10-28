import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { ArrowRight, GraduationCap, KeyRound, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { meQuery, myGroupsQuery } from "@/lib/queries";
import { PHASES, phaseMeta } from "@/lib/phases";
import { fmtAgo } from "@/lib/format";
import { AreaSelect, ProjectCodeTag } from "@/components/project-code";

export const Route = createFileRoute("/_authenticated/aluno/")({
  head: () => ({
    meta: [
      { title: "Meus projetos — PamLab" },
      { name: "description", content: "Entre na turma pelo código e trabalhe no projeto do seu grupo." },
      { property: "og:title", content: "Meus projetos — PamLab" },
      { property: "og:description", content: "Entre na turma pelo código e trabalhe no projeto do seu grupo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(myGroupsQuery(context.me.id)),
  component: StudentHome,
});

function StudentHome() {
  const { data: me } = useSuspenseQuery(meQuery);
  const { data: memberships } = useSuspenseQuery(myGroupsQuery(me!.id));
  const firstName = me?.name.split(" ")[0] ?? "";

  return (
    <>
      <PageHeader mascot
        eyebrow="Área do aluno"
        title={`Olá, ${firstName}`}
        description="Aqui ficam os projetos dos seus grupos. Para entrar numa turma nova, use o código que a professora passou."
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="space-y-4">
          {memberships.length === 0 ? (
            <div className="card-paper p-8 text-center">
              <Users className="mx-auto size-6 text-primary" />
              <h2 className="mt-3 text-xl font-semibold">Você ainda não está em nenhum grupo</h2>
              <p className="mt-1 text-sm text-muted-foreground">Digite o código da turma ao lado para começar.</p>
            </div>
          ) : (
            memberships.map((m) => {
              const g = m.groups;
              if (!g) return null;
              const phase = g.projects?.current_phase ?? 1;
              return (
                <Link
                  key={m.id}
                  to="/aluno/projeto/$groupId"
                  params={{ groupId: g.id }}
                  className="card-paper group flex flex-col gap-3 p-6 transition-all hover:-translate-y-0.5 hover:shadow-lift"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                      {g.classes?.name}
                    </span>
                    <Badge variant="secondary">{g.group_members?.length ?? 0}/3 integrantes</Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-2xl font-semibold">{g.group_name}</h2>
                    <ProjectCodeTag area={g.projects?.area_code} classLabel={g.classes?.code_label} seq={g.projects?.project_seq} />
                  </div>
                  <div className="flex gap-1.5">
                    {PHASES.map((p) => (
                      <span
                        key={p.number}
                        className={
                          p.number < phase
                            ? "h-1.5 flex-1 rounded-full bg-success"
                            : p.number === phase
                              ? "h-1.5 flex-1 rounded-full bg-primary"
                              : "h-1.5 flex-1 rounded-full bg-muted"
                        }
                      />
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Etapa {phase}: {phaseMeta(phase).name}
                      {g.projects && ` · editado ${fmtAgo(g.projects.updated_at)}`}
                    </span>
                    <span className="inline-flex items-center gap-1 font-medium text-primary">
                      Abrir <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </div>
                </Link>
              );
            })
          )}
        </section>

        <div className="space-y-6">
          <JoinClass defaultWhatsapp={me?.whatsapp ?? ""} />
          {memberships.length === 0 && <RedeemTeacherInvite />}
        </div>
      </div>
    </>
  );
}

type FoundClass = { id: string; name: string; teacher_name: string };
type ClassGroup = { group_id: string; group_name: string; member_count: number };

function JoinClass({ defaultWhatsapp }: { defaultWhatsapp: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [found, setFound] = useState<FoundClass | null>(null);
  const [groups, setGroups] = useState<ClassGroup[]>([]);
  const [whatsapp, setWhatsapp] = useState(defaultWhatsapp);
  const [newName, setNewName] = useState("");
  const [area, setArea] = useState("");
  const [busy, setBusy] = useState(false);

  async function lookup(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const [c, g] = await Promise.all([
      supabase.rpc("find_class", { _code: code }),
      supabase.rpc("list_class_groups", { _code: code }),
    ]);
    setBusy(false);
    if (c.error || g.error) {
      toast.error((c.error ?? g.error)!.message);
      return;
    }
    if (!c.data?.length) {
      setFound(null);
      toast.error("Nenhuma turma com esse código.");
      return;
    }
    setFound(c.data[0] ?? null);
    setGroups(g.data ?? []);
  }

  const done = (groupId: string) => {
    qc.invalidateQueries({ queryKey: ["student"] });
    qc.invalidateQueries({ queryKey: ["me"] });
    navigate({ to: "/aluno/projeto/$groupId", params: { groupId } });
  };

  const join = useMutation({
    mutationFn: async (groupId: string) => {
      const { data, error } = await supabase.rpc("join_group", { _group_id: groupId, _whatsapp: whatsapp });
      if (error) throw error;
      return data;
    },
    onSuccess: (id) => {
      toast.success("Você entrou no grupo!");
      done(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("create_group", {
        _code: code,
        _group_name: newName,
        _whatsapp: whatsapp,
        _area: area,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (id) => {
      toast.success("Grupo criado!");
      done(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <aside className="card-paper h-fit p-6">
      <h2 className="mb-1 flex items-center gap-2 text-xl font-semibold">
        <KeyRound className="size-5 text-primary" /> Entrar numa turma
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">Peça o código de 6 letras para a professora.</p>
      <form onSubmit={lookup} className="flex gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="EX.: A1B2C3"
          maxLength={6}
          className="font-mono uppercase tracking-widest"
          aria-label="Código da turma"
          required
        />
        <Button disabled={busy}>Buscar</Button>
      </form>

      {found && (
        <div className="mt-6 space-y-5 border-t border-border pt-5">
          <div>
            <p className="font-display text-lg font-semibold">{found.name}</p>
            <p className="text-sm text-muted-foreground">Professora {found.teacher_name}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="wa">Seu WhatsApp</Label>
            <Input
              id="wa"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="(65) 99999-9999"
              inputMode="tel"
            />
          </div>

          {groups.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Entrar num grupo existente</p>
              <ul className="space-y-2">
                {groups.map((g) => {
                  const full = g.member_count >= 3;
                  return (
                    <li key={g.group_id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-3">
                      <div>
                        <p className="text-sm font-medium">{g.group_name}</p>
                        <p className="text-xs text-muted-foreground">{g.member_count}/3 integrantes</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={full || !whatsapp.trim() || join.isPending}
                        onClick={() => join.mutate(g.group_id)}
                      >
                        {full ? "Completo" : "Entrar"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
            className="space-y-2"
          >
            <Label htmlFor="gname">Ou crie um grupo novo</Label>
            <Input id="gname" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome do grupo" required />
            <div className="flex gap-2">
              <AreaSelect value={area} onChange={setArea} className="flex-1" />
              <Button variant="highlight" disabled={!whatsapp.trim() || !area || create.isPending}>
                <Plus /> Criar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {!whatsapp.trim()
                ? "Preencha seu WhatsApp para continuar."
                : !area
                  ? "Escolha a área do projeto: ela forma o código do projeto."
                  : "A área não pode ser trocada depois (só a professora muda)."}
            </p>
          </form>
        </div>
      )}
    </aside>
  );
}

function RedeemTeacherInvite() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const redeem = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("redeem_teacher_invite", { _code: code });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Pronto! Agora sua conta é de professora.");
      await qc.fetchQuery({ ...meQuery, staleTime: 0 });
      navigate({ to: "/professora", replace: true });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <aside className="card-paper h-fit p-6">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
        <GraduationCap className="size-5 text-primary" /> É professora?
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Se outra professora te passou um código de convite, digite aqui para mudar sua conta para professora.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          redeem.mutate();
        }}
        className="flex gap-2"
      >
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="EX.: 1A2B3C4D"
          maxLength={8}
          className="font-mono uppercase tracking-widest"
          aria-label="Código de convite de professora"
          required
        />
        <Button variant="outline" disabled={redeem.isPending}>
          Usar
        </Button>
      </form>
    </aside>
  );
}
