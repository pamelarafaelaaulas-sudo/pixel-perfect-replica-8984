import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { SHIRT_SIZES, attendeeProblem, formatCpf, onlyDigits, type AttendeeForm } from "@/lib/fair-attendees";

type Member = { student_id: string; whatsapp: string; profiles: { name: string } | null };
type Row = AttendeeForm & { student_id: string };

const empty = (m: Member): AttendeeForm => ({
  full_name: m.profiles?.name ?? "",
  cpf: "",
  birth_date: "",
  shirt_size: "",
  whatsapp: m.whatsapp ?? "",
  guardian_name: "",
  guardian_phone: "",
  dietary: "",
});

/** Student: who goes in person, plus each attendee's registration data. */
export function FairAttendees({ groupId }: { groupId: string }) {
  const { data } = useQuery({
    queryKey: ["fair-attendees", groupId],
    queryFn: async () => {
      const [m, a] = await Promise.all([
        supabase.from("group_members").select("student_id, whatsapp, profiles(name)").eq("group_id", groupId),
        supabase.from("fair_attendees").select("*").eq("group_id", groupId),
      ]);
      if (m.error) throw m.error;
      if (a.error) throw a.error;
      return { members: (m.data ?? []) as unknown as Member[], attendees: (a.data ?? []) as unknown as Row[] };
    },
  });
  if (!data) return null;
  return (
    <div className="space-y-2 border-t pt-3">
      <p className="text-sm font-medium">Quem vai à feira presencialmente?</p>
      {data.members.map((m) => (
        <MemberRow key={m.student_id} groupId={groupId} member={m} saved={data.attendees.find((a) => a.student_id === m.student_id)} />
      ))}
    </div>
  );
}

function MemberRow({ groupId, member, saved }: { groupId: string; member: Member; saved?: Row | undefined }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(!!saved);
  const [f, setF] = useState<AttendeeForm>(
    saved
      ? { ...saved, cpf: formatCpf(saved.cpf), birth_date: saved.birth_date ?? "", whatsapp: saved.whatsapp ?? "", guardian_name: saved.guardian_name ?? "", guardian_phone: saved.guardian_phone ?? "", dietary: saved.dietary ?? "" }
      : empty(member),
  );
  const refresh = () => qc.invalidateQueries({ queryKey: ["fair-attendees", groupId] });
  const save = useMutation({
    mutationFn: async () => {
      const p = attendeeProblem(f);
      if (p) throw new Error(p);
      const { error } = await supabase.from("fair_attendees").upsert({
        group_id: groupId,
        student_id: member.student_id,
        full_name: f.full_name.trim(),
        cpf: onlyDigits(f.cpf),
        birth_date: f.birth_date,
        shirt_size: f.shirt_size,
        whatsapp: f.whatsapp.trim(),
        guardian_name: f.guardian_name.trim() || null,
        guardian_phone: f.guardian_phone.trim() || null,
        dietary: f.dietary.trim().slice(0, 300) || null,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Inscrição salva."); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("fair_attendees").delete().eq("group_id", groupId).eq("student_id", member.student_id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
  const set = (k: keyof AttendeeForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: k === "cpf" ? formatCpf(e.target.value) : e.target.value });

  return (
    <div className="rounded-md bg-background p-2">
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={open}
          onCheckedChange={(c) => { setOpen(c === true); if (c !== true && saved) remove.mutate(); }}
        />
        {member.profiles?.name ?? "Aluno"} {saved && <span className="text-xs text-success">✓ inscrito</span>}
      </label>
      {open && (
        <div className="mt-2 grid gap-2 text-sm">
          <Input placeholder="Nome completo (como no documento)" value={f.full_name} onChange={set("full_name")} maxLength={150} />
          <Input placeholder="CPF 000.000.000-00" value={f.cpf} onChange={set("cpf")} inputMode="numeric" />
          <label className="text-xs text-muted-foreground">Data de nascimento
            <Input type="date" value={f.birth_date} onChange={set("birth_date")} />
          </label>
          <select className="h-9 rounded-md border bg-background px-2" value={f.shirt_size} onChange={set("shirt_size")}>
            <option value="">Tamanho da camiseta</option>
            {SHIRT_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <Input placeholder="WhatsApp do aluno" value={f.whatsapp} onChange={set("whatsapp")} maxLength={20} />
          <Input placeholder="Nome do responsável (se menor de 18)" value={f.guardian_name} onChange={set("guardian_name")} maxLength={150} />
          <Input placeholder="Telefone do responsável" value={f.guardian_phone} onChange={set("guardian_phone")} maxLength={20} />
          <Input placeholder="Restrição alimentar ou alergia (opcional)" value={f.dietary} onChange={set("dietary")} maxLength={300} />
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>Salvar inscrição</Button>
        </div>
      )}
    </div>
  );
}
