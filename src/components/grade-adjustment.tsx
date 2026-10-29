import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPoints } from "@/lib/penalty";

/**
 * Teacher's per-student adjustment of one bimestre grade (added after the late penalty).
 * Zero removes the adjustment.
 */
export function AdjustmentEditor({
  groupId,
  studentId,
  bimester,
  points,
  note,
}: {
  groupId: string;
  studentId: string;
  bimester: number;
  points: number;
  note: string | null;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(points ? String(points).replace(".", ",") : "");
  const [text, setText] = useState(note ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    const n = value.trim() === "" ? 0 : Number(value.replace(",", "."));
    if (!Number.isFinite(n) || n < -10 || n > 10) {
      toast.error("Use um número entre −10 e 10 (ex.: 0,5 ou -1).");
      return;
    }
    setBusy(true);
    const res =
      n === 0
        ? await supabase
            .from("student_grade_adjustments")
            .delete()
            .match({ group_id: groupId, student_id: studentId, bimester })
        : await supabase.from("student_grade_adjustments").upsert(
            {
              group_id: groupId,
              student_id: studentId,
              bimester,
              points: n,
              note: text.trim() || null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "group_id,student_id,bimester" },
          );
    setBusy(false);
    if (res.error) {
      toast.error(`Não foi possível salvar o ajuste. ${res.error.message}`);
      return;
    }
    toast.success(n === 0 ? "Ajuste removido" : "Ajuste salvo");
    setOpen(false);
    await qc.invalidateQueries({ queryKey: ["teacher"] });
  }

  if (!open) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        {points !== 0 && (
          <span className="text-muted-foreground">
            Seu ajuste: <strong className="text-foreground">{points > 0 ? "+" : "−"}{formatPoints(Math.abs(points))}</strong>
            {note && ` — ${note}`}
          </span>
        )}
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setOpen(true)}>
          <SlidersHorizontal className="size-3.5" /> {points !== 0 ? "Mudar ajuste" : "Ajustar nota deste aluno"}
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-md bg-muted/50 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-muted-foreground" htmlFor={`adj-${groupId}-${bimester}`}>
          Pontos (+ ou −)
        </label>
        <Input
          id={`adj-${groupId}-${bimester}`}
          inputMode="decimal"
          className="h-8 w-24"
          placeholder="ex.: 0,5"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <Input
        className="h-8"
        placeholder="Motivo (opcional)"
        value={text}
        maxLength={200}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} Salvar
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
