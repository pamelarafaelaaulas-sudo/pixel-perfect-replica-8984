import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { HeartHandshake, Pencil, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

/**
 * The group's social application / intervention, always visible.
 * `editable` lets members change it after the Pergunta norteadora stage (before that, they write it in the stage form).
 */
export function SocialApplicationCard({
  value,
  projectId,
  groupId,
  studentId,
  editable,
  hint,
  onSaved,
}: {
  value: string | null;
  projectId?: string;
  groupId?: string;
  studentId?: string;
  editable?: boolean;
  hint?: string;
  onSaved?: (v: string) => void;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value ?? "");

  const save = useMutation({
    mutationFn: async () => {
      const v = text.trim();
      if (!v) throw new Error("Escreva a aplicação ou intervenção social do grupo");
      const { error } = await supabase.from("projects").update({ social_application: v }).eq("id", projectId!);
      if (error) throw error;
      if (studentId) {
        await supabase.from("project_contributions").insert({
          project_id: projectId!,
          student_id: studentId,
          section_name: "social_application",
          char_count_added: Math.max(0, v.length - (value?.length ?? 0)),
        });
      }
      return v;
    },
    onSuccess: (v) => {
      toast.success("Aplicação social salva!");
      onSaved?.(v);
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["group", groupId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="card-paper border-l-4 border-l-secondary p-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <HeartHandshake className="size-5 text-secondary" /> Aplicação ou intervenção social
        </h3>
        {editable && !editing && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setText(value ?? "");
              setEditing(true);
            }}
          >
            <Pencil /> {value?.trim() ? "Editar" : "Escrever"}
          </Button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <Textarea
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Aplicação ou intervenção social"
            placeholder="Ex.: Criar pontos de coleta de óleo na escola e uma campanha com os moradores do bairro."
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={save.isPending}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
              <Save /> {save.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      ) : value?.trim() ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{value}</p>
      ) : (
        <p className="text-sm italic text-muted-foreground">{hint ?? "Ainda não escrita."}</p>
      )}
    </div>
  );
}
