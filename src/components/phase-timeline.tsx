import { Check, Clock, Lock, AlertTriangle, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";
import { BANNER_PHASE, isWrittenPart, phaseMeta } from "@/lib/phases";
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
  const planning = phases.filter((p) => p.phase < BANNER_PHASE && !isWrittenPart(p.phase));
  const written = phases.filter((p) => isWrittenPart(p.phase));
  const banner = phases.filter((p) => p.phase >= BANNER_PHASE);
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">Planejamento</p>
        <Cards phases={planning} active={active} onSelect={onSelect} className="sm:grid-cols-3" />
      </div>
      {written.length > 0 && (
        <div>
          <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Projeto escrito · {written.length} partes, cada uma com seu prazo
          </p>
          <Cards phases={written} active={active} onSelect={onSelect} className="sm:grid-cols-3 lg:grid-cols-5" compact />
        </div>
      )}
      {banner.length > 0 && (
        <div>
          <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            3º bimestre · Banner no Canva
          </p>
          <Cards phases={banner} active={active} onSelect={onSelect} className="sm:grid-cols-3" />
        </div>
      )}
    </div>
  );
}

function Cards({
  phases,
  active,
  onSelect,
  className,
  compact,
}: {
  phases: PhaseInfo[];
  active?: number | undefined;
  onSelect?: ((phase: number) => void) | undefined;
  className?: string;
  compact?: boolean;
}) {
  return (
    <ol className={cn("grid gap-3", className)}>
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
                "card-paper flex h-full w-full flex-col text-left transition-all",
                compact ? "gap-1 p-3" : "gap-2 p-4",
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
