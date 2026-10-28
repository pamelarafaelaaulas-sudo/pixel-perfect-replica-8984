import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Copy, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { meQuery, teacherInvitesQuery } from "@/lib/queries";
import { fmtDateTime } from "@/lib/format";

export function TeacherInvitesDialog() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { data: invites = [], isLoading } = useQuery({ ...teacherInvitesQuery, enabled: open });

  const create = useMutation({
    mutationFn: async () => {
      const me = await qc.ensureQueryData(meQuery);
      const { error } = await supabase.from("teacher_invites").insert({ created_by: me!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Código criado!");
      qc.invalidateQueries({ queryKey: teacherInvitesQuery.queryKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("teacher_invites").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: teacherInvitesQuery.queryKey }),
    onError: (e: Error) => toast.error(e.message),
  });

  async function copy(code: string) {
    await navigator.clipboard.writeText(code);
    toast.success("Código copiado.");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <UserPlus /> Convidar professora
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Convidar professora</DialogTitle>
          <DialogDescription>
            Gere um código e passe para a colega. Ela digita o código ao criar a conta (opção "Sou professora") e já
            entra como professora, com as próprias turmas. Cada código vale para uma pessoa só.
          </DialogDescription>
        </DialogHeader>

        <Button onClick={() => create.mutate()} disabled={create.isPending} className="w-full">
          Gerar novo código
        </Button>

        <div className="space-y-2">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : invites.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum código gerado ainda.</p>
          ) : (
            <ul className="max-h-72 space-y-2 overflow-y-auto">
              {invites.map((inv) => (
                <li
                  key={inv.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-base tracking-widest">{inv.code}</p>
                    {inv.used_at ? (
                      <p className="text-xs text-muted-foreground">
                        Usado por {inv.used_by_name ?? "uma professora"} em {fmtDateTime(inv.used_at)}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Criado em {fmtDateTime(inv.created_at)}</p>
                    )}
                  </div>
                  {inv.used_at ? (
                    <Badge variant="secondary">Usado</Badge>
                  ) : (
                    <div className="flex shrink-0 gap-1">
                      <Button size="icon" variant="ghost" onClick={() => copy(inv.code)} aria-label="Copiar código">
                        <Copy />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => remove.mutate(inv.id)}
                        disabled={remove.isPending}
                        aria-label="Cancelar código"
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
