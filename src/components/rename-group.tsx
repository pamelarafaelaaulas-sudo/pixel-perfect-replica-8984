import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

export function RenameGroupButton({ groupId, current }: { groupId: string; current: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(current);
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: async () => {
      const v = name.trim();
      if (v.length < 2) throw new Error("Digite um nome com pelo menos 2 letras.");
      const { data, error } = await supabase.from("groups").update({ group_name: v }).eq("id", groupId).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Não foi possível renomear este grupo.");
    },
    onSuccess: () => {
      toast.success("Nome do grupo atualizado");
      setOpen(false);
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setName(current); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Renomear grupo" title="Renomear grupo" onClick={(e) => e.stopPropagation()}>
          <Pencil className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader><DialogTitle>Renomear grupo</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={save.isPending}>Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
