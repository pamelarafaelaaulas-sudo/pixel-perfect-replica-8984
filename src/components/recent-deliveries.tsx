import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { PHASES } from "@/lib/phases";

const SEEN_KEY = "facet-flow:deliveries-seen-at";

type Row = { id: string; phase_number: number; submitted_at: string; groupId: string; groupName: string; className: string };

async function fetchRecent(): Promise<Row[]> {
  const { data, error } = await supabase
    .from("phase_submissions")
    .select("id, phase_number, submitted_at, projects!inner(group_id, groups!inner(id, group_name, classes!inner(name)))")
    .order("submitted_at", { ascending: false })
    .limit(15);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    phase_number: r.phase_number,
    submitted_at: r.submitted_at,
    groupId: r.projects.groups.id,
    groupName: r.projects.groups.group_name,
    className: r.projects.groups.classes.name,
  }));
}

const phaseName = (n: number) => PHASES.find((p) => p.number === n)?.name ?? `Etapa ${n}`;

export function RecentDeliveries() {
  const { data = [] } = useQuery({ queryKey: ["teacher", "recent-deliveries"], queryFn: fetchRecent, refetchInterval: 60_000 });
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const known = useRef<Set<string> | null>(null);

  useEffect(() => { setSeenAt(localStorage.getItem(SEEN_KEY) ?? new Date(0).toISOString()); }, []);

  useEffect(() => {
    if (!data.length) return;
    if (known.current) {
      for (const r of data) if (!known.current.has(r.id)) toast.success(`Nova entrega: ${r.groupName}`, { description: `${phaseName(r.phase_number)} — ${r.className}` });
    }
    known.current = new Set(data.map((r) => r.id));
  }, [data]);

  if (seenAt === null) return null;
  const unread = data.filter((r) => r.submitted_at > seenAt).length;
  const markRead = () => { const now = new Date().toISOString(); localStorage.setItem(SEEN_KEY, now); setSeenAt(now); };

  return (
    <section className="mb-6 rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <Bell className="size-5 text-primary" /> Entregas recentes
          {unread > 0 && <span className="rounded-full bg-destructive px-2 py-0.5 text-xs text-destructive-foreground">{unread} nova{unread > 1 ? "s" : ""}</span>}
        </h2>
        {unread > 0 && <Button size="sm" variant="ghost" onClick={markRead}>Marcar como vistas</Button>}
      </div>
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma entrega ainda.</p>
      ) : (
        <ul className="divide-y">
          {data.slice(0, 8).map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div>
                {r.submitted_at > seenAt && <span className="mr-2 inline-block size-2 rounded-full bg-destructive" />}
                <strong>{r.groupName}</strong> entregou <strong>{phaseName(r.phase_number)}</strong>
                <span className="text-muted-foreground"> · {r.className} · {new Date(r.submitted_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
              </div>
              <Button size="sm" variant="outline" asChild>
                <Link to="/professora/grupo/$groupId" params={{ groupId: r.groupId }}>Ver entrega</Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
