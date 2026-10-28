import type { ReactNode } from "react";
import caricature from "@/assets/pamela-caricatura.png";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  mascot,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  mascot?: boolean;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 items-center gap-4">
        {mascot && (
          <span className="relative size-20 shrink-0 overflow-hidden rounded-full bg-brand-gradient shadow-paper ring-4 ring-highlight md:size-24">
            <img
              src={caricature}
              alt="Caricatura da professora Pâmela"
              className="absolute left-1/2 top-1 h-[300%] w-auto max-w-none -translate-x-1/2"
            />
          </span>
        )}
        <div className="min-w-0">
        {eyebrow && (
          <div className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</div>
        )}
        <h1 className="text-3xl font-semibold text-foreground md:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="card-paper flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-accent text-accent-foreground">{icon}</div>
      <h3 className="text-xl font-semibold">{title}</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{text}</p>
      {action}
    </div>
  );
}
