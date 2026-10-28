import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Hash } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { AREAS, projectCode } from "@/lib/project-code";
import { cn } from "@/lib/utils";

export function ProjectCodeTag({
  area,
  classLabel,
  seq,
  className,
}: {
  area: string | null | undefined;
  classLabel: string | null | undefined;
  seq: number | null | undefined;
  className?: string;
}) {
  const code = projectCode(area, classLabel, seq);
  if (!code) return null;
  return (
    <span
      title={classLabel ? "Código do projeto" : "Código do projeto (a professora ainda não definiu a sigla da turma)"}
      className={cn(
        "inline-flex items-center gap-1 rounded-md bg-highlight px-2 py-0.5 font-mono text-xs font-semibold tracking-wide text-highlight-foreground",
        className,
      )}
    >
      <Hash className="size-3" />
      {code}
    </span>
  );
}

export function AreaSelect({
  value,
  onChange,
  id,
  disabled,
  className,
}: {
  value: string | null | undefined;
  onChange: (v: string) => void;
  id?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Select value={value ?? ""} onValueChange={onChange} disabled={disabled ?? false}>
      <SelectTrigger id={id} className={className} aria-label="Área do projeto">
        <SelectValue placeholder="Escolha a área" />
      </SelectTrigger>
      <SelectContent>
        {AREAS.map((a) => (
          <SelectItem key={a.code} value={a.code}>
            {a.label} ({a.code})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Saves the project's area. Students can do it once (when empty); the teacher can change it. */
export function ProjectAreaPicker({
  projectId,
  groupId,
  value,
  className,
}: {
  projectId: string;
  groupId: string;
  value: string | null | undefined;
  className?: string;
}) {
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: async (area: string) => {
      const { error } = await supabase.from("projects").update({ area_code: area }).eq("id", projectId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Área salva — código do projeto atualizado");
      qc.invalidateQueries({ queryKey: ["group", groupId] });
      qc.invalidateQueries({ queryKey: ["student"] });
      qc.invalidateQueries({ queryKey: ["class"] });
      qc.invalidateQueries({ queryKey: ["teacher"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <AreaSelect
      value={value}
      onChange={(v) => save.mutate(v)}
      disabled={save.isPending}
      className={cn("h-8 w-56", className)}
    />
  );
}
