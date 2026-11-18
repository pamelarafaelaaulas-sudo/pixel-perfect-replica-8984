import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

export function DeleteGroupButton({ groupId, name }: { groupId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("delete_group" as never, { _group_id: groupId } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Grupo excluído"); setOpen(false); qc.invalidateQueries(); navigate({ to: "/professora" }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-destructive"><Trash2 className="size-4" /> Excluir grupo</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir o grupo {name}?</DialogTitle>
          <DialogDescription>Apaga para sempre o projeto, entregas, notas, diário e documentos do grupo. Os alunos ficam livres para entrar em outro grupo. Digite EXCLUIR para confirmar.</DialogDescription>
        </DialogHeader>
        <input className="w-full rounded-md border border-input bg-background p-2 text-sm" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="EXCLUIR" />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="destructive" onClick={() => del.mutate()} disabled={del.isPending || confirm.trim().toUpperCase() !== "EXCLUIR"}>Excluir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MoveMemberButton({ memberId, groupId, classId, name }: { memberId: string; groupId: string; classId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const qc = useQueryClient();
  const groups = useQuery({
    queryKey: ["move-member-groups", classId],
    enabled: open,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("groups")
        .select("id,group_name,class_id,classes!inner(name,teacher_id),group_members(id)")
        .eq("classes.teacher_id", u.user?.id ?? "")
        .order("group_name");
      if (error) throw error;
      return data
        .filter((g) => g.id !== groupId && (g.group_members?.length ?? 0) < 3)
        .sort((a, b) => Number(b.class_id === classId) - Number(a.class_id === classId));
    },
  });
  const move = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("move_member" as never, { _member_id: memberId, _target_group_id: target } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success(`${name} mudou de grupo`); setOpen(false); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Mover ${name} de grupo`} title="Mover para outro grupo"><Users /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mover {name} para outro grupo</DialogTitle>
          <DialogDescription>Só aparecem grupos com vaga (até 3 alunos). As entregas feitas continuam no grupo antigo.</DialogDescription>
        </DialogHeader>
        <select className="w-full rounded-md border border-input bg-background p-2 text-sm" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Escolha o grupo…</option>
          {groups.data?.map((g) => (
            <option key={g.id} value={g.id}>{g.group_name} — {g.classes?.name} ({g.group_members?.length ?? 0}/3)</option>
          ))}
        </select>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => move.mutate()} disabled={move.isPending || !target}>Mover</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
