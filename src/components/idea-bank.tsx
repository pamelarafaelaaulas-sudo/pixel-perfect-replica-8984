import { useMemo, useState } from "react";
import { Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AREAS, areaLabel } from "@/lib/project-code";
import { useQuery } from "@tanstack/react-query";
import { ideaBankQuery, ideaUsageQuery, type Idea } from "@/lib/idea-bank";

export function IdeaBank({ onUse, disabled }: { onUse: (idea: Idea) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [area, setArea] = useState<string>("");
  const [q, setQ] = useState("");
  const { data: ideas = [] } = useQuery(ideaBankQuery);
  const { data: usage = {} } = useQuery(ideaUsageQuery);
  const list = useMemo(
    () =>
      ideas.filter(
        (i) => (!area || i.area === area) && (!q || (i.theme + i.question + i.summary).toLowerCase().includes(q.toLowerCase())),
      ),
    [ideas, area, q],
  );
  return (
    <div className="rounded-xl border border-accent/40 bg-accent/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Lightbulb className="size-5 text-primary" />
          <p className="text-sm font-medium">Sem ideia de tema? Explore o Banco de Inspirações.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" type="button">Ver ideias</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Banco de Inspirações</DialogTitle>
              <DialogDescription>Ideias alinhadas à BNCC. Escolha uma e adapte à realidade do seu grupo.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" type="button" variant={area ? "outline" : "default"} onClick={() => setArea("")}>Todas</Button>
              {AREAS.map((a) => (
                <Button key={a.code} size="sm" type="button" variant={area === a.code ? "default" : "outline"} onClick={() => setArea(a.code)}>
                  {a.label}
                </Button>
              ))}
            </div>
            <Input placeholder="Buscar por palavra..." value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="grid gap-3">
              {list.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma ideia encontrada.</p>}
              {list.map((i) => (
                <div key={i.id} className="rounded-lg border p-4">
                  <div className="mb-2 flex flex-wrap gap-1">
                    <Badge variant="secondary">{areaLabel(i.area)}</Badge>
                    {i.bncc.map((b) => (
                      <Badge key={b} variant="muted">{b}</Badge>
                    ))}
                  </div>
                  {usage[i.id]?.length ? (
                    <p className="mb-2 rounded-md bg-accent/20 px-2 py-1 text-xs font-medium">
                      Já em uso por: {usage[i.id]!.join(", ")}
                    </p>
                  ) : null}
                  <p className="font-semibold">{i.theme}</p>
                  <p className="mt-1 text-sm italic">{i.question}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{i.summary}</p>
                  <Button
                    className="mt-3"
                    size="sm"
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      onUse(i);
                      setOpen(false);
                      toast.success("Ideia aplicada! Adapte o tema e salve o rascunho.");
                    }}
                  >
                    Usar esta ideia
                  </Button>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
