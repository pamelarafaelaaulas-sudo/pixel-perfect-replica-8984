import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, FileUp, FlaskConical, Loader2, Save, Trash2, Calculator, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { needsEthicsReview, recommendedSample, tcleFileProblem } from "@/lib/ethics";

const BUCKET = "ethics-docs";

export type EthicsExtraProject = {
  id: string;
  ethics_human_research: boolean | null;
  ethics_lab: boolean | null;
  ethics_lab_epis: string | null;
  ethics_biosafety_declared_at: string | null;
  ethics_population: number | null;
  ethics_sample_size: number | null;
  ethics_review_status: string | null;
  ethics_review_note: string | null;
};

type Patch = Partial<Omit<EthicsExtraProject, "id">>;

export function useEthicsSave(projectId: string, groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Patch) => {
      const { error } = await supabase.from("projects").update(patch).eq("id", projectId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["group", groupId] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function SampleCalculator({ project, groupId, editable }: { project: EthicsExtraProject; groupId: string; editable: boolean }) {
  const save = useEthicsSave(project.id, groupId);
  const [pop, setPop] = useState(project.ethics_population?.toString() ?? "");
  const [sample, setSample] = useState(project.ethics_sample_size?.toString() ?? "");
  const popN = Number(pop);
  const rec = recommendedSample(popN);
  const sampleN = Number(sample);
  const dirty = pop !== (project.ethics_population?.toString() ?? "") || sample !== (project.ethics_sample_size?.toString() ?? "");
  const valid = popN > 0 && sampleN > 0 && sampleN <= popN && Number.isInteger(popN) && Number.isInteger(sampleN);
  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-foreground"><Calculator className="size-4" /> Calculadora de amostragem (obrigatória)</p>
      <p className="text-xs text-muted-foreground">Quantas pessoas existem no grupo pesquisado (população) e quantas vocês vão ouvir (amostra). Cálculo com 95% de confiança e 5% de margem de erro.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`pop-${project.id}`}>População (total de pessoas)</Label>
          <Input id={`pop-${project.id}`} type="number" min={1} value={pop} disabled={!editable} onChange={(e) => setPop(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`sample-${project.id}`}>Amostra planejada</Label>
          <Input id={`sample-${project.id}`} type="number" min={1} value={sample} disabled={!editable} onChange={(e) => setSample(e.target.value)} />
        </div>
      </div>
      {popN > 0 && (
        <p className="text-sm text-foreground">
          Amostra recomendada: <strong>{rec} pessoas</strong>
          {sampleN > 0 && sampleN < rec && <span className="text-warning-foreground"> · a amostra planejada está abaixo do recomendado; explique isso na metodologia.</span>}
        </p>
      )}
      {sampleN > popN && popN > 0 && <p className="text-xs text-destructive">A amostra não pode ser maior que a população.</p>}
      {editable && (
        <Button type="button" size="sm" variant="outline" disabled={!dirty || !valid || save.isPending}
          onClick={() => save.mutate({ ethics_population: popN, ethics_sample_size: sampleN })}>
          {save.isPending ? <Loader2 className="animate-spin" /> : <Save />} Salvar amostragem
        </Button>
      )}
    </div>
  );
}

export function TcleUploads({ groupId, editable }: { groupId: string; editable: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const files = useQuery({
    queryKey: ["ethics-docs", groupId],
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).list(groupId, { sortBy: { column: "created_at", order: "desc" } });
      if (error) throw error;
      return (data ?? []).filter((f) => f.id);
    },
  });
  const upload = useMutation({
    mutationFn: async (list: File[]) => {
      for (const f of list) {
        const problem = tcleFileProblem(f.name, f.size);
        if (problem) throw new Error(`${f.name}: ${problem}`);
      }
      for (const f of list) {
        const safe = f.name.normalize("NFD").replace(/[^\w.-]+/g, "_");
        const { error } = await supabase.storage.from(BUCKET).upload(`${groupId}/${Date.now()}-${safe}`, f);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("TCLE enviado."); files.refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.storage.from(BUCKET).remove([`${groupId}/${name}`]);
      if (error) throw error;
    },
    onSuccess: () => files.refetch(),
    onError: (e: Error) => toast.error(e.message),
  });
  async function open(name: string) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(`${groupId}/${name}`, 300);
    if (error || !data) return toast.error("Não foi possível abrir o arquivo.");
    window.open(data.signedUrl, "_blank", "noopener");
  }
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">TCLEs assinados (PDF ou DOCX, até 10 MB cada)</p>
      {files.data?.length ? (
        <ul className="space-y-1 text-sm">
          {files.data.map((f) => (
            <li key={f.name} className="flex items-center gap-2">
              <button type="button" className="truncate text-primary hover:underline" onClick={() => open(f.name)}>{f.name.replace(/^\d+-/, "")}</button>
              {editable && (
                <Button type="button" size="icon" variant="ghost" className="size-7" aria-label="Remover" onClick={() => remove.mutate(f.name)}>
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs italic text-muted-foreground">Nenhum TCLE enviado ainda.</p>
      )}
      {editable && (
        <>
          <input ref={input} type="file" multiple hidden accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => { const l = Array.from(e.target.files ?? []); e.target.value = ""; if (l.length) upload.mutate(l); }} />
          <Button type="button" size="sm" variant="secondary" disabled={upload.isPending} onClick={() => input.current?.click()}>
            {upload.isPending ? <Loader2 className="animate-spin" /> : <FileUp />} Enviar TCLE
          </Button>
        </>
      )}
    </div>
  );
}

export function LabScreening({ project, groupId, editable }: { project: EthicsExtraProject; groupId: string; editable: boolean }) {
  const save = useEthicsSave(project.id, groupId);
  const [epis, setEpis] = useState(project.ethics_lab_epis ?? "");
  return (
    <div className="space-y-3 border-t border-primary/20 pt-4">
      <p className="flex items-center gap-2 text-sm font-medium text-foreground"><FlaskConical className="size-4" /> A pesquisa usa laboratório, reagentes ou produtos químicos/biológicos?</p>
      <RadioGroup className="flex flex-wrap gap-6" value={project.ethics_lab === null ? "" : project.ethics_lab ? "sim" : "nao"}
        onValueChange={(v) => save.mutate({ ethics_lab: v === "sim" })} disabled={!editable || save.isPending} aria-label="Usa laboratório?">
        <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="nao" /> Não</label>
        <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="sim" /> Sim</label>
      </RadioGroup>
      {project.ethics_lab && (
        <div className="space-y-3 rounded-lg border border-border bg-card p-4">
          <div className="space-y-1.5">
            <Label htmlFor={`epis-${project.id}`}>EPIs que o grupo vai usar (obrigatório)</Label>
            <Textarea id={`epis-${project.id}`} rows={2} value={epis} disabled={!editable} placeholder="Jaleco, luvas nitrílicas, óculos de proteção, máscara..." onChange={(e) => setEpis(e.target.value)} />
            {editable && (
              <Button type="button" size="sm" variant="outline" disabled={epis.trim() === (project.ethics_lab_epis ?? "") || save.isPending}
                onClick={() => save.mutate({ ethics_lab_epis: epis.trim() || null })}>
                <Save /> Salvar EPIs
              </Button>
            )}
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={!!project.ethics_biosafety_declared_at} disabled={!editable || save.isPending}
              onCheckedChange={(c) => save.mutate({ ethics_biosafety_declared_at: c === true ? new Date().toISOString() : null })} />
            <span>Declaramos que vamos usar os EPIs listados, seguir as normas de biossegurança do laboratório, trabalhar só com a supervisão da professora e descartar resíduos corretamente.</span>
          </label>
        </div>
      )}
    </div>
  );
}

export function EthicsStatusBanner({ project, delivered }: { project: EthicsExtraProject; delivered: boolean }) {
  if (!needsEthicsReview(project) || !delivered) return null;
  if (project.ethics_review_status === "aprovado")
    return <p className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 p-3 text-sm text-foreground"><CheckCircle2 className="size-4" /> Triagem ética aprovada pela mentora.</p>;
  if (project.ethics_review_status === "refazer")
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground">
        <p className="flex items-center gap-2 font-medium"><XCircle className="size-4" /> A mentora pediu correções na triagem ética.</p>
        {project.ethics_review_note && <p className="mt-1 whitespace-pre-wrap">{project.ethics_review_note}</p>}
        <p className="mt-1 text-xs text-muted-foreground">Corrija abaixo; ao salvar, volta para validação.</p>
      </div>
    );
  return <p className="flex items-center gap-2 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm font-medium text-foreground"><Clock className="size-4" /> Aguardando Validação Ética da Mentora — a Introdução só abre depois da aprovação.</p>;
}

/** Teacher: formal approval or request for corrections. */
export function TeacherEthicsReview({ project, groupId }: { project: EthicsExtraProject & { ethics_collection: string[] }; groupId: string }) {
  const save = useEthicsSave(project.id, groupId);
  const [note, setNote] = useState(project.ethics_review_note ?? "");
  if (!needsEthicsReview(project)) return null;
  const status = project.ethics_review_status;
  const decide = (s: "aprovado" | "refazer") =>
    save.mutate({ ethics_review_status: s, ethics_review_note: note.trim() || null, ethics_reviewed_at: new Date().toISOString() } as Patch,
      { onSuccess: () => toast.success(s === "aprovado" ? "Triagem ética aprovada." : "Correções pedidas ao grupo.") });
  return (
    <div className="mt-3 space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
      <p className="font-medium text-foreground">Validação ética: {status === "aprovado" ? "aprovada" : status === "refazer" ? "correções pedidas" : "aguardando sua validação"}</p>
      {project.ethics_human_research && (
        <p className="text-muted-foreground">Amostra: {project.ethics_sample_size ?? "—"} de {project.ethics_population ?? "—"} (recomendado {project.ethics_population ? recommendedSample(project.ethics_population) : "—"})</p>
      )}
      {project.ethics_lab && (
        <p className="text-muted-foreground">Laboratório · EPIs: {project.ethics_lab_epis || "—"} · Declaração de biossegurança: {project.ethics_biosafety_declared_at ? "assinada" : "não"}</p>
      )}
      {project.ethics_human_research && project.ethics_collection.includes("presencial") && <TcleUploads groupId={groupId} editable={false} />}
      <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Orientação para o grupo (obrigatória para pedir correções)" />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={save.isPending} onClick={() => decide("aprovado")}><CheckCircle2 /> Aprovar triagem</Button>
        <Button size="sm" variant="outline" disabled={save.isPending || !note.trim()} onClick={() => decide("refazer")}><XCircle /> Pedir correções</Button>
      </div>
    </div>
  );
}
