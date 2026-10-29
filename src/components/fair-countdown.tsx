import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { CalendarClock, PartyPopper, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { countdown, pickFair } from "@/lib/countdown";

type FairClass = { fair_at: string | null; fair_name: string | null };

function useNow() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const fmtFair = (d: Date) =>
  d.toLocaleString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Countdown to the science fair. Teachers (`teacherId`) can set the date for all their classes. */
export function FairCountdown({ classes, teacherId }: { classes: FairClass[]; teacherId?: string }) {
  const now = useNow();
  const fair = pickFair(classes, now ?? new Date());
  if (!fair) {
    if (!teacherId) return null;
    return (
      <div className="card-paper mb-6 flex flex-wrap items-center justify-between gap-3 border-l-4 border-l-highlight p-5">
        <div className="flex items-center gap-3">
          <CalendarClock className="size-6 text-primary" />
          <div>
            <p className="font-semibold">Contagem regressiva para a FECITI/MS</p>
            <p className="text-sm text-muted-foreground">Defina a data da feira para você e os alunos verem quanto tempo falta.</p>
          </div>
        </div>
        <FairDateDialog teacherId={teacherId} current={null} />
      </div>
    );
  }
  const left = now ? countdown(fair.at, now) : null;
  const units = left
    ? [
        { v: left.days, l: left.days === 1 ? "dia" : "dias" },
        { v: left.hours, l: left.hours === 1 ? "hora" : "horas" },
        { v: left.minutes, l: "min" },
        { v: left.seconds, l: "seg" },
      ]
    : [];

  return (
    <section
      aria-label={`Contagem regressiva para a ${fair.name}`}
      className="mb-6 overflow-hidden rounded-2xl bg-gradient-to-r from-primary to-secondary p-5 text-primary-foreground shadow-lift md:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest opacity-80">Contagem regressiva</p>
          <h2 className="flex items-center gap-2 text-2xl font-semibold">
            {left?.started ? <PartyPopper className="size-6 text-highlight" /> : <CalendarClock className="size-6 text-highlight" />}
            {left?.started ? `A ${fair.name} começou!` : fair.name}
          </h2>
          <p className="text-sm capitalize opacity-90">{fmtFair(fair.at)}</p>
        </div>
        {left && !left.started && (
          <div className="flex gap-2" role="timer" aria-live="off">
            {units.map((u) => (
              <div key={u.l} className="min-w-16 rounded-xl bg-background/15 px-3 py-2 text-center backdrop-blur">
                <p className="font-display text-3xl font-semibold tabular-nums leading-none">{String(u.v).padStart(2, "0")}</p>
                <p className="mt-1 text-xs uppercase tracking-wide opacity-80">{u.l}</p>
              </div>
            ))}
          </div>
        )}
        {teacherId && <FairDateDialog teacherId={teacherId} current={fair} />}
      </div>
    </section>
  );
}

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function FairDateDialog({ teacherId, current }: { teacherId: string; current: { at: Date; name: string } | null }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: async (v: { at: string; name: string }) => {
      const { error } = await supabase
        .from("classes")
        .update({ fair_at: v.at, fair_name: v.name })
        .eq("teacher_id", teacherId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Data da feira salva para todas as suas turmas");
      qc.invalidateQueries({ queryKey: ["teacher"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const raw = String(f.get("at") ?? "");
    const d = new Date(raw);
    if (!raw || Number.isNaN(d.getTime())) {
      toast.error("Escolha a data e o horário da feira");
      return;
    }
    save.mutate({ at: d.toISOString(), name: String(f.get("name") ?? "").trim() || "FECITI/MS" });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={current ? "secondary" : "default"} size="sm">
          <Pencil /> {current ? "Mudar data" : "Definir data da feira"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Data da feira</DialogTitle>
        </DialogHeader>
        <form id="fair-form" onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="fair-name">Nome da feira</Label>
            <Input id="fair-name" name="name" defaultValue={current?.name ?? "FECITI/MS"} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fair-at">Dia e horário de início</Label>
            <Input id="fair-at" name="at" type="datetime-local" required defaultValue={current ? toLocalInput(current.at) : ""} />
          </div>
          <p className="text-sm text-muted-foreground">Vale para todas as suas turmas. Os alunos veem a contagem na tela deles.</p>
        </form>
        <DialogFooter>
          <Button type="submit" form="fair-form" disabled={save.isPending}>
            {save.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
