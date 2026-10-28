import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Check, Copy, ExternalLink, Plus, RotateCcw, School, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, EmptyState } from "@/components/page-header";
import { BannerBriefView } from "@/components/banner-stage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { teacherClassesQuery } from "@/lib/queries";
import { BANNER_SIZES, DEFAULT_BANNER_SECTIONS, bannerBrief } from "@/lib/banner";
import { isCanvaUrl } from "@/lib/phase-rules";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/professora/banner")({
  head: () => ({
    meta: [
      { title: "Modelo do banner — Caderno de Projetos" },
      { name: "description", content: "Monte o modelo do banner da turma no Canva e deixe o link pronto para os grupos." },
      { property: "og:title", content: "Modelo do banner — Caderno de Projetos" },
      { property: "og:description", content: "Modelo do banner da turma, com link do Canva, tamanho e seções." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { turma?: string } =>
    typeof search["turma"] === "string" ? { turma: search["turma"] } : {},
  loader: ({ context }) => context.queryClient.ensureQueryData(teacherClassesQuery),
  component: BannerTemplatePage,
});

type ClassRow = Database["public"]["Tables"]["classes"]["Row"];

function BannerTemplatePage() {
  const { turma } = Route.useSearch();
  const { data: classes } = useSuspenseQuery(teacherClassesQuery);
  const navigate = useNavigate({ from: Route.fullPath });
  const cls = classes.find((c) => c.id === turma) ?? classes[0];

  return (
    <>
      <Link to="/professora" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Painel
      </Link>
      <PageHeader
        eyebrow="3º bimestre · Banner"
        title="Modelo do banner"
        description="Monte o modelo no Canva, cole o link aqui e escolha o tamanho e as seções. Tudo aparece pronto para os grupos na etapa do banner."
      />
      {!cls ? (
        <EmptyState
          icon={<School className="size-5" />}
          title="Nenhuma turma ainda"
          text="Crie uma turma no painel para montar o modelo do banner dela."
        />
      ) : (
        <>
          <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Turmas">
            {classes.map((c) => {
              const ready = isCanvaUrl(c.banner_template_url);
              return (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={c.id === cls.id}
                  onClick={() => navigate({ search: { turma: c.id } })}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm transition-colors",
                    c.id === cls.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground hover:bg-muted",
                  )}
                >
                  {ready && <Check className="size-3.5" />}
                  {c.name}
                </button>
              );
            })}
          </div>
          <TemplateEditor key={`${cls.id}-${JSON.stringify([cls.banner_template_url, cls.banner_size, cls.banner_sections, cls.banner_instructions])}`} cls={cls} others={classes.filter((c) => c.id !== cls.id)} />
        </>
      )}
    </>
  );
}

function TemplateEditor({ cls, others }: { cls: ClassRow; others: ClassRow[] }) {
  const qc = useQueryClient();
  const saved = bannerBrief(cls);
  const [url, setUrl] = useState(cls.banner_template_url ?? "");
  const [size, setSize] = useState(saved.size);
  const [sections, setSections] = useState<string[]>(saved.sections);
  const [newSection, setNewSection] = useState("");
  const [instructions, setInstructions] = useState(saved.instructions);
  const [alsoFor, setAlsoFor] = useState<string[]>([]);

  const invalid = url.trim() !== "" && !isCanvaUrl(url);
  const draft = bannerBrief({
    banner_template_url: url,
    banner_size: size,
    banner_sections: sections,
    banner_instructions: instructions,
  });
  const dirty =
    url.trim() !== (cls.banner_template_url ?? "") ||
    size !== saved.size ||
    JSON.stringify(draft.sections) !== JSON.stringify(saved.sections) ||
    instructions.trim() !== saved.instructions;

  const save = useMutation({
    mutationFn: async () => {
      const ids = [cls.id, ...alsoFor];
      const { error } = await supabase
        .from("classes")
        .update({
          banner_template_url: url.trim() || null,
          banner_size: size,
          banner_sections: draft.sections,
          banner_instructions: instructions.trim() || null,
        })
        .in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (n) => {
      toast.success(n > 1 ? `Modelo salvo em ${n} turmas` : "Modelo do banner salvo");
      setAlsoFor([]);
      qc.invalidateQueries({ queryKey: ["teacher", "classes"] });
      qc.invalidateQueries({ queryKey: ["class"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const move = (i: number, d: -1 | 1) =>
    setSections((s) => {
      const j = i + d;
      if (j < 0 || j >= s.length) return s;
      const next = [...s];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });

  function addSection() {
    const v = newSection.trim();
    if (!v) return;
    setSections((s) => [...s, v]);
    setNewSection("");
  }

  async function copyLink() {
    if (!draft.templateUrl) return;
    await navigator.clipboard.writeText(draft.templateUrl);
    toast.success("Link copiado");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
      <section className="card-paper space-y-6 p-6">
        <div>
          <h2 className="text-xl font-semibold">1. Monte o modelo no Canva</h2>
          <ol className="mt-2 ml-5 list-decimal space-y-1 text-sm text-muted-foreground">
            <li>No Canva, crie um design personalizado no tamanho {size}.</li>
            <li>Coloque os blocos das seções abaixo, as cores e o logo da escola.</li>
            <li>
              Clique em <strong>Compartilhar</strong> → <strong>Link do modelo</strong> (ou “Somente visualização”) e copie o
              link.
            </li>
          </ol>
          <Button asChild variant="secondary" size="sm" className="mt-3">
            <a href="https://www.canva.com/" target="_blank" rel="noreferrer">
              Abrir o Canva <ExternalLink className="size-3" />
            </a>
          </Button>
        </div>

        <div className="space-y-2">
          <Label htmlFor="template-url" className="text-base font-semibold">
            2. Cole o link do modelo
          </Label>
          <Input
            id="template-url"
            value={url}
            placeholder="https://www.canva.com/design/.../view?mode=preview"
            onChange={(e) => setUrl(e.target.value)}
          />
          {invalid ? (
            <p className="text-xs text-destructive">O link precisa ser do Canva (começa com https://www.canva.com/).</p>
          ) : (
            <p className="text-xs text-muted-foreground">Os grupos abrem este link na etapa do banner.</p>
          )}
        </div>

        <div className="space-y-2">
          <Label className="text-base font-semibold">3. Tamanho do banner</Label>
          <Select value={size} onValueChange={setSize}>
            <SelectTrigger className="sm:w-72" aria-label="Tamanho do banner">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BANNER_SIZES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-base font-semibold">4. Seções que o banner precisa ter</Label>
            <Button variant="ghost" size="sm" onClick={() => setSections([...DEFAULT_BANNER_SECTIONS])}>
              <RotateCcw /> Sugestão
            </Button>
          </div>
          <ol className="space-y-1.5">
            {sections.map((s, i) => (
              <li key={`${i}-${s}`} className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm">
                <span className="w-5 font-mono text-xs text-muted-foreground">{i + 1}.</span>
                <span className="flex-1">{s}</span>
                <Button variant="ghost" size="icon" className="size-7" aria-label={`Subir ${s}`} onClick={() => move(i, -1)} disabled={i === 0}>
                  <ArrowUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={`Descer ${s}`}
                  onClick={() => move(i, 1)}
                  disabled={i === sections.length - 1}
                >
                  <ArrowDown />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-destructive"
                  aria-label={`Remover ${s}`}
                  onClick={() => setSections((x) => x.filter((_, k) => k !== i))}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ol>
          <div className="flex gap-2">
            <Input
              value={newSection}
              placeholder="Nova seção (ex.: QR code do vídeo)"
              aria-label="Nova seção"
              onChange={(e) => setNewSection(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addSection();
                }
              }}
            />
            <Button variant="outline" onClick={addSection} disabled={!newSection.trim()}>
              <Plus /> Adicionar
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="instructions" className="text-base font-semibold">
            5. Orientações para os grupos
          </Label>
          <Textarea
            id="instructions"
            rows={4}
            value={instructions}
            placeholder="Ex.: fonte mínima 28 no texto, no máximo 3 imagens, coloquem o nome da escola no topo."
            onChange={(e) => setInstructions(e.target.value)}
          />
        </div>

        {others.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Usar este mesmo modelo também em:</p>
            <div className="flex flex-wrap gap-4">
              {others.map((o) => (
                <label key={o.id} className="inline-flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={alsoFor.includes(o.id)}
                    onCheckedChange={(v) => setAlsoFor((a) => (v ? [...a, o.id] : a.filter((x) => x !== o.id)))}
                  />
                  {o.name}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
          <p className="text-sm text-muted-foreground">{dirty ? "Há alterações não salvas." : "Tudo salvo."}</p>
          <Button onClick={() => save.mutate()} disabled={invalid || (!dirty && alsoFor.length === 0) || save.isPending}>
            Salvar modelo
          </Button>
        </div>
      </section>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <div className="card-paper space-y-4 p-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">O que o grupo vê</h2>
            <Badge variant={saved.ready ? "success" : "warning"}>{saved.ready ? "Pronto para os grupos" : "Falta o link do Canva"}</Badge>
          </div>
          <BannerBriefView brief={draft} />
          {draft.ready && (
            <Button variant="outline" size="sm" onClick={copyLink}>
              <Copy /> Copiar link do modelo
            </Button>
          )}
          {dirty && <p className="text-xs text-muted-foreground">Prévia com as alterações ainda não salvas.</p>}
        </div>
      </aside>
    </div>
  );
}
