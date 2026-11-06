import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, CalendarDays, Loader2, NotebookPen, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { diaryEntriesQuery, diaryGradesQuery, diarySubmissionsQuery } from "@/lib/queries";
import {
  DIARY_KINDS,
  DIARY_MAX_BACKDATE_DAYS,
  FREQUENCY_LABEL,
  diaryKindLabel,
  diaryStats,
  diaryToday,
  type DiaryKind,
  type DiaryStats,
} from "@/lib/diary";
import { formatPoints } from "@/lib/penalty";
import { fmtDateTime } from "@/lib/format";

type Entry = { id: string; student_id: string; entry_date: string; kind: string; content: string; created_at: string };

const fmtDay = (d: string) => format(parseISO(d), "dd/MM/yyyy (EEE)", { locale: ptBR });

const KIND_BADGE: Record<string, "muted" | "success" | "destructive" | "warning"> = {
  registro: "muted",
  acerto: "success",
  erro: "destructive",
  mudanca: "warning",
};

export function StatsLine({ s }: { s: DiaryStats }) {
  return (
    <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
      <div className="rounded-lg bg-muted p-2">
        <p className="text-xs text-muted-foreground">Registros</p>
        <p className="font-display text-xl font-semibold">{s.total}</p>
      </div>
      <div className="rounded-lg bg-muted p-2">
        <p className="text-xs text-muted-foreground">Frequência</p>
        <p className="font-medium">{FREQUENCY_LABEL[s.frequency]}</p>
        {s.weeks > 0 && (
          <p className="text-xs text-muted-foreground">
            {s.activeWeeks} de {s.weeks} semana(s)
          </p>
        )}
      </div>
      <div className="rounded-lg bg-muted p-2">
        <p className="text-xs text-muted-foreground">Intervalo médio</p>
        <p className="font-medium">{s.avgGapDays === null ? "—" : `${formatPoints(s.avgGapDays)} dia(s)`}</p>
      </div>
      <div className="rounded-lg bg-muted p-2">
        <p className="text-xs text-muted-foreground">Último registro</p>
        <p className="font-medium">{s.lastDate ? format(parseISO(s.lastDate), "dd/MM/yyyy") : "—"}</p>
        {s.daysSinceLast !== null && <p className="text-xs text-muted-foreground">há {s.daysSinceLast} dia(s)</p>}
      </div>
    </div>
  );
}

/** Chronological history of diary entries, grouped by day. */
export function DiaryTimeline({ entries, nameOf }: { entries: Entry[]; nameOf?: ((id: string) => string) | undefined }) {
  if (entries.length === 0) return <p className="text-sm italic text-muted-foreground">Nenhum registro ainda.</p>;
  const days = [...new Set(entries.map((e) => e.entry_date))];
  return (
    <ol className="space-y-4">
      {days.map((d) => (
        <li key={d} className="relative border-l-2 border-primary/30 pl-4">
          <span className="absolute -left-[7px] top-1 size-3 rounded-full bg-primary" aria-hidden />
          <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">{fmtDay(d)}</p>
          <ul className="mt-2 space-y-2">
            {entries
              .filter((e) => e.entry_date === d)
              .map((e) => (
                <li key={e.id} className="rounded-lg border border-border bg-card p-3 text-sm">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge variant={KIND_BADGE[e.kind] ?? "muted"}>{diaryKindLabel(e.kind)}</Badge>
                    {nameOf && <span className="text-xs font-medium text-foreground">{nameOf(e.student_id)}</span>}
                    <span className="text-xs text-muted-foreground">escrito em {fmtDateTime(e.created_at)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-foreground">{e.content}</p>
                </li>
              ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

/** Student: new diary entry (dated, append-only). */
export function DiaryEntryForm({ groupId, studentId }: { groupId: string; studentId: string }) {
  const qc = useQueryClient();
  const today = diaryToday();
  const minDate = format(new Date(parseISO(today).getTime() - DIARY_MAX_BACKDATE_DAYS * 86400000), "yyyy-MM-dd");
  const [date, setDate] = useState(today);
  const [kind, setKind] = useState<DiaryKind>("registro");
  const [content, setContent] = useState("");

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("diary_entries")
        .insert({ group_id: groupId, student_id: studentId, entry_date: date, kind, content: content.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Registro salvo no diário");
      setContent("");
      setKind("registro");
      setDate(diaryToday());
      qc.invalidateQueries({ queryKey: ["diary", "entries", groupId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      className="card-paper space-y-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate();
      }}
    >
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <NotebookPen className="size-5 text-primary" /> Novo registro
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="diary-date">Data da atividade</Label>
          <Input id="diary-date" type="date" value={date} min={minDate} max={today} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>Tipo</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as DiaryKind)}>
            <SelectTrigger aria-label="Tipo do registro">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DIARY_KINDS.map((k) => (
                <SelectItem key={k.key} value={k.key}>
                  {k.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="diary-content">O que aconteceu?</Label>
        <Textarea
          id="diary-content"
          rows={5}
          maxLength={5000}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Ex.: Medimos o pH das 3 amostras. A amostra 2 deu errado porque a fita molhou antes; vamos repetir amanhã."
          required
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Registre também os erros e as mudanças de rota. Os registros não podem ser apagados nem editados; para corrigir, faça um novo
        registro. Dá para datar até {DIARY_MAX_BACKDATE_DAYS} dias para trás.
      </p>
      <Button disabled={add.isPending || content.trim().length < 3}>
        {add.isPending ? <Loader2 className="animate-spin" /> : <Plus />} Salvar registro
      </Button>
    </form>
  );
}

/** Sidebar card on the student's project page. */
export function DiaryCard({ groupId, studentId }: { groupId: string; studentId: string }) {
  const entries = useQuery(diaryEntriesQuery(groupId));
  const submissions = useQuery(diarySubmissionsQuery(groupId));
  const status = submissions.data?.[0]?.status;
  const mine = (entries.data ?? []).filter((e) => e.student_id === studentId);
  const s = diaryStats(mine, diaryToday());
  return (
    <div className="card-paper space-y-3 p-5">
      <h3 className="flex items-center gap-2 text-lg font-semibold">
        <BookOpen className="size-5 text-primary" /> Diário de bordo
      </h3>
      <p className="text-sm text-muted-foreground">
        {s.total === 0
          ? "Você ainda não fez nenhum registro."
          : `${s.total} registro(s) seus · último em ${format(parseISO(s.lastDate!), "dd/MM")} · ${FREQUENCY_LABEL[s.frequency]}`}
      </p>
      <Button asChild size="sm" className="w-full">
        <Link to="/aluno/diario/$groupId" params={{ groupId }}>
          <NotebookPen /> Abrir diário
        </Link>
      </Button>
      <Badge variant={status === "pending" ? "warning" : status === "approved" ? "success" : status === "changes_requested" ? "destructive" : "muted"}>
        {status === "pending" ? "Aguardando aprovação" : status === "approved" ? "Diário aprovado" : status === "changes_requested" ? "Correções solicitadas" : "Em elaboração"}
      </Badge>
    </div>
  );
}

function DiaryGradeForm({
  groupId,
  studentId,
  existing,
}: {
  groupId: string;
  studentId: string;
  existing: { score: number | string; feedback: string | null; updated_at: string } | undefined;
}) {
  const qc = useQueryClient();
  const [score, setScore] = useState(existing ? formatPoints(Number(existing.score)) : "");
  const [feedback, setFeedback] = useState(existing?.feedback ?? "");
  const n = Number(score.replace(",", "."));
  const valid = score.trim() !== "" && !Number.isNaN(n) && n >= 0 && n <= 10;
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("diary_grades")
        .upsert({ group_id: groupId, student_id: studentId, score: n, feedback: feedback.trim() || null }, { onConflict: "group_id,student_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Nota do diário salva");
      qc.invalidateQueries({ queryKey: ["diary", "grades", groupId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-3 rounded-lg bg-muted/60 p-4">
      <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor={`dg-${studentId}`}>Nota (0 a 10)</Label>
          <Input id={`dg-${studentId}`} inputMode="decimal" value={score} onChange={(e) => setScore(e.target.value)} placeholder="Ex.: 8,5" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`df-${studentId}`}>Observações para o aluno</Label>
          <Textarea id={`df-${studentId}`} rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={() => save.mutate()} disabled={!valid || save.isPending}>
          {save.isPending ? <Loader2 className="animate-spin" /> : <Save />} Salvar nota do diário
        </Button>
        {existing && <span className="text-xs text-muted-foreground">Salva em {fmtDateTime(existing.updated_at)}</span>}
      </div>
    </div>
  );
}

/** Teacher, group page (3rd bimestre only): each student's diary history, stats and grade. */
export function TeacherDiaryTab({ groupId, members }: { groupId: string; members: { id: string; name: string }[] }) {
  const entries = useQuery(diaryEntriesQuery(groupId));
  const grades = useQuery(diaryGradesQuery(groupId));
  const today = diaryToday();
  if (entries.isPending || grades.isPending)
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Carregando…
      </p>
    );
  return (
    <div className="space-y-10">
      {members.map((m) => {
        const mine = (entries.data ?? []).filter((e) => e.student_id === m.id);
        return (
          <section key={m.id} className="space-y-4">
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <CalendarDays className="size-5 text-primary" /> {m.name}
            </h3>
            <StatsLine s={diaryStats(mine, today)} />
            <DiaryGradeForm
              key={grades.data?.find((g) => g.student_id === m.id)?.updated_at ?? "new"}
              groupId={groupId}
              studentId={m.id}
              existing={grades.data?.find((g) => g.student_id === m.id)}
            />
            <DiaryTimeline entries={mine} />
          </section>
        );
      })}
    </div>
  );
}
