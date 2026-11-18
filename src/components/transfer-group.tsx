import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

export function TransferGroupButton({ groupId, currentClassId }: { groupId: string; currentClassId: string }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const qc = useQueryClient();
  const classes = useQuery({
    queryKey: ["transfer-classes"],
    enabled: open,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase.from("classes").select("id,name").eq("teacher_id", u.user?.id ?? "").order("name");
      if (error) throw error;
      return data.filter((c) => c.id !== currentClassId);
    },
  });
  const move = useMutation({
    mutationFn: async () => {
      if (!target) throw new Error("Escolha a turma de destino.");
      const { error } = await supabase.rpc("transfer_group" as never, { _group_id: groupId, _class_id: target } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Grupo transferido de turma"); setOpen(false); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><ArrowRightLeft className="size-4" /> Transferir de turma</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transferir grupo de turma</DialogTitle>
          <DialogDescription>Entregas, notas e diário continuam iguais. Prazos e sigla passam a ser da nova turma.</DialogDescription>
        </DialogHeader>
        <select className="w-full rounded-md border border-input bg-background p-2 text-sm" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Escolha a turma…</option>
          {classes.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => move.mutate()} disabled={move.isPending || !target}>Transferir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
