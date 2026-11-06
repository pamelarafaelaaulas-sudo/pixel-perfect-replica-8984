import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ClipboardCopy, ExternalLink, FileDown, Loader2, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  COLLECTION_FORMATS,
  HUMAN_RESEARCH_QUESTION,
  ethicsProblems,
  formsConsentText,
  imageConsentDocument,
  isGoogleFormUrl,
  tcleDocument,
  type CollectionFormat,
  type EthicsDoc,
  type EthicsDocInput,
} from "@/lib/ethics";
import { downloadBlob } from "@/lib/export-xlsx";
import { projectCode } from "@/lib/project-code";
import { EthicsStatusBanner, LabScreening, SampleCalculator, TcleUploads, TeacherEthicsReview, type EthicsExtraProject } from "@/components/ethics-extra";

type EthicsProject = EthicsExtraProject & {
  id: string;
  title: string | null;
  general_objective: string | null;
  institution: string | null;
  area_code: string | null;
  code_number: number | null;
  ethics_human_research: boolean | null;
  ethics_collection: string[];
  ethics_form_url: string | null;
};

type Cls = { class_code: string; code_label: string | null; ethics_form_template_url?: string | null };

async function docInput(project: EthicsProject, cls: Cls, students: string[]): Promise<EthicsDocInput> {
  const teacher = await supabase.rpc("find_class", { _code: cls.class_code });
  return {
    title: project.title,
    projectCode: cls.code_label ? projectCode(project.area_code, cls.code_label, project.code_number) : null,
    institution: project.institution,
    students: [...students].sort((a, b) => a.localeCompare(b, "pt-BR")),
    teacherName: teacher.data?.[0]?.teacher_name ?? null,
    objective: project.general_objective,
    year: new Date().getFullYear(),
  };
}

/** Student, Metodologia stage: mandatory question about research with people, TCLE alert and collection formats. */
export function EthicsScreening({
  project,
  cls,
  groupId,
  studentId,
  students,
  editable,
  delivered = false,
}: {
  delivered?: boolean;
  project: EthicsProject;
  cls: Cls;
  groupId: string;
  studentId: string;
  students: string[];
  editable: boolean;
}) {
  const qc = useQueryClient();
  const [formUrl, setFormUrl] = useState(project.ethics_form_url ?? "");
  const [busyDoc, setBusyDoc] = useState<string | null>(null);
  const answer = project.ethics_human_research;
  const formats = project.ethics_collection ?? [];
  const template = cls.ethics_form_template_url?.trim() || null;
  const problems = ethicsProblems({ ...project, ethics_form_template_url: template });

  const save = useMutation({
    mutationFn: async (patch: { ethics_human_research?: boolean; ethics_collection?: string[]; ethics_form_url?: string | null }) => {
      const { error } = await supabase.from("projects").update(patch).eq("id", project.id);
      if (error) throw error;
      await supabase.from("project_contributions").insert({
        project_id: project.id,
        student_id: studentId,
        section_name: "ethics_screening",
        char_count_added: 0,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["group", groupId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  function toggleFormat(f: CollectionFormat, on: boolean) {
    const next = on ? [...new Set([...formats, f])] : formats.filter((x) => x !== f);
    save.mutate({ ethics_collection: next });
  }

  async function download(build: (i: EthicsDocInput) => EthicsDoc, key: string) {
    setBusyDoc(key);
    try {
      const doc = build(await docInput(project, cls, students));
      const { buildEthicsDocx } = await import("@/lib/ethics-docx");
      downloadBlob(await buildEthicsDocx(doc), doc.fileName);
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível gerar o arquivo Word.");
    } finally {
      setBusyDoc(null);
    }
  }

  async function copyFormsText() {
    const text = formsConsentText(await docInput(project, cls, students));
    navigator.clipboard.writeText(text).then(
      () => toast.success("Texto do TCLE copiado. Cole na descrição do seu formulário."),
      () => toast.error("Não foi possível copiar."),
    );
  }

  const urlDirty = formUrl.trim() !== (project.ethics_form_url ?? "");
  const urlInvalid = formUrl.trim() !== "" && !isGoogleFormUrl(formUrl);

  return (
    <section className="space-y-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
        <div>
          <p className="font-medium text-foreground">Triagem ética (obrigatória)</p>
          <p className="text-sm text-muted-foreground">{HUMAN_RESEARCH_QUESTION}</p>
        </div>
      </div>
      <EthicsStatusBanner project={project} delivered={delivered} />

      <RadioGroup
        className="flex flex-wrap gap-6"
        value={answer === null ? "" : answer ? "sim" : "nao"}
        onValueChange={(v) => save.mutate({ ethics_human_research: v === "sim" })}
        disabled={!editable || save.isPending}
        aria-label="A pesquisa envolve seres humanos?"
      >
        <label className="flex items-center gap-2 text-sm">
          <RadioGroupItem value="nao" id={`eth-no-${project.id}`} /> Não
        </label>
        <label className="flex items-center gap-2 text-sm">
          <RadioGroupItem value="sim" id={`eth-yes-${project.id}`} /> Sim
        </label>
      </RadioGroup>

      {answer === false && (
        <p className="text-sm text-muted-foreground">Sem participantes humanos: a metodologia segue o fluxo normal.</p>
      )}

      {answer === true && (
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p className="text-foreground">
              Pesquisa com pessoas exige o <strong>Termo de Consentimento Livre e Esclarecido (TCLE)</strong> de cada participante
              (assinado pelo responsável, se for menor de 18 anos). Sem ele, o trabalho pode ser desclassificado nas feiras.
            </p>
          </div>

          <SampleCalculator project={project} groupId={groupId} editable={editable} />

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Como os dados serão coletados? (pode marcar os dois)</p>
            {COLLECTION_FORMATS.map((f) => (
              <label key={f.key} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={formats.includes(f.key)}
                  disabled={!editable || save.isPending}
                  onCheckedChange={(c) => toggleFormat(f.key, c === true)}
                />
                {f.label}
              </label>
            ))}
          </div>

          {formats.includes("online") && (
            <div className="space-y-3 rounded-lg border border-border bg-card p-4">
              <p className="text-sm font-medium text-foreground">Coleta online via Google Forms</p>
              <ol className="ml-5 list-decimal space-y-1 text-sm text-muted-foreground">
                <li>Abra o modelo da professora e use “Fazer uma cópia” (ou crie um formulário novo).</li>
                <li>Mantenha o cabeçalho e o TCLE na descrição, com a pergunta de concordância como a primeira do formulário.</li>
                <li>Cole abaixo o link do formulário do grupo (Enviar → link).</li>
              </ol>
              <div className="flex flex-wrap gap-2">
                {template ? (
                  <Button asChild variant="secondary" size="sm">
                    <a href={template} target="_blank" rel="noreferrer">
                      Abrir modelo do Google Forms <ExternalLink className="size-3" />
                    </a>
                  </Button>
                ) : (
                  <span className="text-xs italic text-muted-foreground">A professora ainda não colocou o modelo do formulário.</span>
                )}
                <Button type="button" variant="outline" size="sm" onClick={copyFormsText}>
                  <ClipboardCopy /> Copiar texto do TCLE para o formulário
                </Button>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`form-url-${project.id}`}>Link do formulário do grupo (obrigatório)</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id={`form-url-${project.id}`}
                    value={formUrl}
                    disabled={!editable}
                    placeholder="https://forms.gle/..."
                    onChange={(e) => setFormUrl(e.target.value)}
                  />
                  {editable && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!urlDirty || urlInvalid || save.isPending}
                      onClick={() => save.mutate({ ethics_form_url: formUrl.trim() || null })}
                    >
                      {save.isPending ? <Loader2 className="animate-spin" /> : <Save />} Salvar link
                    </Button>
                  )}
                </div>
                {urlInvalid && <p className="text-xs text-destructive">O link precisa ser do Google Forms (forms.gle ou docs.google.com/forms).</p>}
              </div>
            </div>
          )}

          {formats.includes("presencial") && (
            <div className="space-y-3 rounded-lg border border-border bg-card p-4">
              <p className="text-sm font-medium text-foreground">Coleta presencial ou entrevista pessoal</p>
              <p className="text-sm text-muted-foreground">
                Baixe os modelos em Word, imprima uma via para cada participante, colete as assinaturas antes de começar e guarde
                tudo na pasta do projeto.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => download(tcleDocument, "tcle")} disabled={!!busyDoc}>
                  {busyDoc === "tcle" ? <Loader2 className="animate-spin" /> : <FileDown />} TCLE (.docx)
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => download(imageConsentDocument, "imagem")} disabled={!!busyDoc}>
                  {busyDoc === "imagem" ? <Loader2 className="animate-spin" /> : <FileDown />} Termo de uso de imagem (.docx)
                </Button>
              </div>
              <TcleUploads groupId={groupId} editable={editable} />
            </div>
          )}
        </div>
      )}

      <LabScreening project={project} groupId={groupId} editable={editable} />

      {editable && problems.length > 0 && <p className="text-xs text-destructive">{problems[0]}</p>}
    </section>
  );
}

/** Read-only summary for the teacher. */
export function EthicsSummary({ project, groupId }: { project: EthicsProject; groupId?: string | undefined }) {
  return (
    <>
      <EthicsSummaryBase project={project} />
      {groupId && <TeacherEthicsReview project={project} groupId={groupId} />}
    </>
  );
}

function EthicsSummaryBase({ project }: { project: Pick<EthicsProject, "ethics_human_research" | "ethics_collection" | "ethics_form_url"> }) {
  if (project.ethics_human_research === null)
    return <p className="text-sm italic text-muted-foreground">Triagem ética ainda não respondida.</p>;
  if (!project.ethics_human_research)
    return <p className="text-sm text-muted-foreground">Triagem ética: a pesquisa não envolve seres humanos.</p>;
  const labels = COLLECTION_FORMATS.filter((f) => project.ethics_collection.includes(f.key)).map((f) => f.label);
  return (
    <div className="space-y-1 text-sm">
      <p className="text-foreground">
        <strong>Triagem ética:</strong> envolve seres humanos (TCLE obrigatório) · {labels.join(" e ") || "formato não escolhido"}
      </p>
      {project.ethics_form_url && (
        <a href={project.ethics_form_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all text-primary hover:underline">
          Formulário do grupo <ExternalLink className="size-3" />
        </a>
      )}
    </div>
  );
}
