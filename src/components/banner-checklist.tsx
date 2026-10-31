import { BookOpenCheck, ChevronDown, Lock, Unlock } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { BANNER_CHECKLIST, BANNER_GUIDE, checklistComplete, type ChecklistKey } from "@/lib/banner-review";

/** "Como fazer um bom banner científico" — shown before the upload. */
export function BannerGuide({ defaultOpen = false }: { defaultOpen?: boolean }) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="rounded-lg border border-border">
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 p-4 text-left text-sm font-medium text-foreground">
        <span className="flex items-center gap-2">
          <BookOpenCheck className="size-4 text-primary" /> Como fazer um bom banner científico
        </span>
        <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="grid gap-3 border-t border-border p-4 sm:grid-cols-2">
          {BANNER_GUIDE.map((g) => (
            <li key={g.title} className="text-sm">
              <p className="font-medium text-foreground">{g.title}</p>
              <p className="text-muted-foreground">{g.text}</p>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

export type ChecklistState = Partial<Record<ChecklistKey, boolean>>;

/** Required checklist: the upload stays locked until every item is ticked. */
export function BannerChecklist({
  idPrefix,
  value,
  onChange,
  disabled,
}: {
  idPrefix: string;
  value: ChecklistState;
  onChange: (v: ChecklistState) => void;
  disabled?: boolean;
}) {
  const done = checklistComplete(value);
  return (
    <div className={done ? "rounded-lg border border-success/40 bg-success/5 p-4" : "rounded-lg border border-warning/50 bg-warning/10 p-4"}>
      <p className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
        {done ? <Unlock className="size-4 text-success" /> : <Lock className="size-4" />}
        {done ? "Checklist completo: envio liberado" : "Confirme cada item para liberar o envio do arquivo"}
      </p>
      <ul className="space-y-2.5">
        {BANNER_CHECKLIST.map((item) => {
          const id = `${idPrefix}-${item.key}`;
          return (
            <li key={item.key} className="flex items-start gap-3">
              <Checkbox
                id={id}
                checked={value[item.key] === true}
                disabled={disabled}
                onCheckedChange={(c) => onChange({ ...value, [item.key]: c === true })}
                className="mt-0.5"
              />
              <label htmlFor={id} className="text-sm leading-snug">
                <span className="font-medium text-foreground">{item.label}:</span>{" "}
                <span className="text-muted-foreground">{item.text}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
