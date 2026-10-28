import { Check, Clock, Lock, AlertTriangle, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";
import { PHASES, phaseMeta } from "@/lib/phases";
import { fmtDate } from "@/lib/format";
import { formatPoints, type PhaseInfo } from "@/lib/penalty";

export function PhaseTimeline({
  phases,
  active,
  onSelect,
}: {
  phases: PhaseInfo[];
  active?: number;
  onSelect?: (phase: number) => void;
}) {
  return (
    <ol className="grid gap-3 sm:grid-cols-4">
      {phases.map((p) => {
        const meta = phaseMeta(p.phase);
        const late = p.daysLate > 0;
        const Icon =
          p.state === "delivered"
            ? Check
            : p.state === "in_progress"
              ? late
                ? AlertTriangle
                : Clock
              : p.state === "skipped"
                ? SkipForward
                : Lock;
        const clickable = !!onSelect;
        return (
          <li key={p.phase}>
            <button
              type="button"
              disabled={!clickable}
              onClick={() => onSelect?.(p.phase)}
              className={cn(
                "card-paper flex h-full w-full flex-col gap-2 p-4 text-left transition-all",
                clickable && "hover:-translate-y-0.5 hover:shadow-lift",
                !clickable && "cursor-default",
                active === p.phase && "ring-2 ring-primary",
                p.state === "upcoming" && "opacity-70",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-muted-foreground">ETAPA {p.phase}</span>
                <span
                  className={cn(
                    "grid size-7 place-items-center rounded-full",
                    p.state === "delivered" && !late && "bg-success text-success-foreground",
                    p.state === "delivered" && late && "bg-warning text-warning-foreground",
                    p.state === "in_progress" && !late && "bg-primary text-primary-foreground",
                    p.state === "in_progress" && late && "bg-destructive text-destructive-foreground",
                    (p.state === "upcoming" || p.state === "skipped") && "bg-muted text-muted-foreground",
                  )}
                >
                  <Icon className="size-3.5" />
                </span>
              </div>
              <p className="font-display text-base font-semibold leading-tight text-foreground">{meta.name}</p>
              <p className="text-xs text-muted-foreground">Prazo: {fmtDate(p.dueDate)}</p>
              <p
                className={cn(
                  "text-xs font-medium",
                  late ? "text-destructive" : p.state === "delivered" ? "text-success" : "text-muted-foreground",
                )}
              >
                {p.state === "delivered"
                  ? late
                    ? `Entregue com ${p.daysLate} dia(s) de atraso`
                    : "Entregue no prazo"
                  : p.state === "skipped"
                    ? "Liberada pela professora"
                    : late
                      ? `${p.daysLate} dia(s) de atraso`
                      : p.state === "in_progress"
                        ? "Em andamento"
                        : "Ainda não liberada"}
                {late && ` · −${formatPoints(p.penalty)}`}
              </p>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
