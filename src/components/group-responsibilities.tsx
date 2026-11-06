import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { BookOpen, UserRoundCheck } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { groupResponsibilitiesQuery } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";

type Member = { student_id: string; profiles: { name: string } | null };

export function GroupResponsibilities({ groupId, members, editable = false }: { groupId: string; members: Member[]; editable?: boolean }) {
  const { data } = useSuspenseQuery(groupResponsibilitiesQuery(groupId));
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: async ({ field, value }: { field: "leader_student_id" | "diary_student_id"; value: string }) => {
      const { error } = await supabase.from("group_responsibilities").upsert({
        group_id: groupId, [field]: value === "none" ? null : value,
      }, { onConflict: "group_id" });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["group", groupId, "responsibilities"] });
      qc.invalidateQueries({ queryKey: ["teacher", "whatsapp"] });
      toast.success("Responsável do grupo salvo");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const roles = [
    { field: "leader_student_id" as const, label: "Líder do grupo", icon: UserRoundCheck, note: "Recebe as cobranças de prazo do grupo." },
    { field: "diary_student_id" as const, label: "Responsável pelo diário de bordo", icon: BookOpen, note: "Organiza os registros; todos continuam podendo escrever no diário." },
  ];
  return <section className="mb-6 border-y border-border py-4" aria-label="Responsáveis do grupo">
    <h2 className="mb-3 text-lg font-semibold">Responsáveis do grupo</h2>
    <div className="grid gap-4 md:grid-cols-2">
      {roles.map(({ field, label, icon: Icon, note }) => <div key={field} className="min-w-0 space-y-2">
        <p className="flex items-center gap-2 text-sm font-medium"><Icon className="size-4 shrink-0 text-primary" /> {label}</p>
        {editable ? <Select value={data?.[field] ?? "none"} disabled={save.isPending} onValueChange={(value) => save.mutate({ field, value })}>
          <SelectTrigger aria-label={label}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Ainda não escolhido</SelectItem>
            {members.map((m) => <SelectItem key={m.student_id} value={m.student_id}>{m.profiles?.name ?? "Integrante"}</SelectItem>)}
          </SelectContent>
        </Select> : <p className="break-words text-sm">{members.find((m) => m.student_id === data?.[field])?.profiles?.name ?? "Ainda não escolhido"}</p>}
        <p className="text-xs text-muted-foreground">{note}</p>
      </div>)}
    </div>
    {!data?.leader_student_id && <p className="mt-3 text-xs text-muted-foreground">Sem líder escolhido, os lembretes de prazo continuam destinados a todos os integrantes.</p>}
  </section>;
}