import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, ExternalLink, FileUp, Loader2, Palette, Ruler, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TEMPLATE_LINK_PROBLEM, isCanvaUrl, isTemplateLink } from "@/lib/phase-rules";
import { syncBannerToDrive } from "@/lib/banner-drive.functions";
import type { BannerBrief } from "@/lib/banner";

const BUCKET = "banners";
const MAX_BYTES = 25 * 1024 * 1024;
const ACCEPT = "application/pdf,image/png,image/jpeg";

/** Opens a private banner file in a new tab through a short-lived signed link. */
export function BannerFileLink({ path, name }: { path: string; name: string | null }) {
  const [busy, setBusy] = useState(false);
  async function open() {
    setBusy(true);
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 10);
    setBusy(false);
    if (error || !data) {
      toast.error("Não foi possível abrir o arquivo do banner.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }
  return (
    <Button type="button" variant="outline" size="sm" onClick={open} disabled={busy}>
      {busy ? <Loader2 className="animate-spin" /> : <Download />} {name || "Arquivo do banner"}
    </Button>
  );
}

/** Read-only banner summary for the teacher. */
export function BannerView({
  canvaUrl,
  filePath,
  fileName,
}: {
  canvaUrl: string | null;
  filePath: string | null;
  fileName: string | null;
}) {
  if (!canvaUrl && !filePath)
    return <p className="text-sm italic text-muted-foreground">Ainda não enviado.</p>;
  return (
    <div className="flex flex-wrap items-center gap-3">
      {canvaUrl && (
        <Button asChild variant="outline" size="sm">
          <a href={canvaUrl} target="_blank" rel="noreferrer">
            <Palette /> Abrir no Canva <ExternalLink className="size-3" />
          </a>
        </Button>
      )}
      {filePath && <BannerFileLink path={filePath} name={fileName} />}
    </div>
  );
}

/** The teacher's banner template as the group sees it: Canva link, size, sections and guidance. */
export function BannerBriefView({ brief }: { brief: BannerBrief }) {
  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/50 p-4 text-sm">
      <div>
        <p className="font-medium text-foreground">Modelo da professora</p>
        {brief.ready ? (
          <>
            <ol className="mt-1 ml-5 list-decimal space-y-0.5 text-muted-foreground">
              <li>
                Um integrante abre o modelo e clica em <strong>Usar modelo</strong>: o Canva cria uma cópia só do grupo.
              </li>
              <li>
                Na cópia, clique em <strong>Compartilhar</strong> e convide os colegas do grupo para editar.
              </li>
              <li>Copie o link dessa cópia (não o do modelo) e cole abaixo.</li>
            </ol>
            <Button asChild variant="secondary" size="sm" className="mt-3">
              <a href={brief.templateUrl!} target="_blank" rel="noreferrer">
                <Palette /> Abrir modelo no Canva <ExternalLink className="size-3" />
              </a>
            </Button>
          </>
        ) : (
          <p className="mt-1 text-muted-foreground">A professora ainda não colocou o modelo do banner.</p>
        )}
      </div>
      <p className="flex items-center gap-2 text-foreground">
        <Ruler className="size-4 text-primary" /> Tamanho: <strong>{brief.size}</strong>
      </p>
      <div>
        <p className="font-medium text-foreground">O banner precisa ter</p>
        <ol className="mt-1 ml-5 list-decimal space-y-0.5 text-muted-foreground">
          {brief.sections.map((s, i) => (
            <li key={`${i}-${s}`}>{s}</li>
          ))}
        </ol>
      </div>
      {brief.instructions && (
        <div>
          <p className="font-medium text-foreground">Orientações</p>
          <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{brief.instructions}</p>
        </div>
      )}
    </div>
  );
}

/** Student editor for the banner stage: Canva link + final exported file. */
export function BannerStage({
  groupId,
  projectId,
  studentId,
  brief,
  canvaUrl,
  filePath,
  fileName,
  editable,
}: {
  groupId: string;
  projectId: string;
  studentId: string;
  brief: BannerBrief;
  canvaUrl: string | null;
  filePath: string | null;
  fileName: string | null;
  editable: boolean;
}) {
  const qc = useQueryClient();
  const copyToDrive = useServerFn(syncBannerToDrive);
  const [link, setLink] = useState(canvaUrl ?? "");
  const [savingLink, setSavingLink] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const linkDirty = link.trim() !== (canvaUrl ?? "");
  const linkIsTemplate = isTemplateLink(link, brief.templateUrl);
  const linkInvalid = link.trim() !== "" && (!isCanvaUrl(link) || linkIsTemplate);

  async function logContribution(section: string, chars: number) {
    await supabase
      .from("project_contributions")
      .insert({
        project_id: projectId,
        student_id: studentId,
        section_name: section,
        char_count_added: chars,
      });
  }

  async function saveLink() {
    setSavingLink(true);
    const value = link.trim() || null;
    const { error } = await supabase
      .from("projects")
      .update({ banner_canva_url: value })
      .eq("id", projectId);
    setSavingLink(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await logContribution("banner_canva_url", value?.length ?? 0);
    toast.success("Link do Canva salvo");
    qc.invalidateQueries({ queryKey: ["group", groupId] });
  }

  async function upload(file: File) {
    if (!ACCEPT.split(",").includes(file.type)) {
      toast.error("Envie o banner em PDF, PNG ou JPG.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("O arquivo passa de 25 MB. Exporte com qualidade menor.");
      return;
    }
    setUploading(true);
    const safe = file.name
      .normalize("NFD")
      .replace(/[^\w.-]+/g, "_")
      .slice(-80);
    const path = `${groupId}/${Date.now()}-${safe}`;
    const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
    if (up.error) {
      setUploading(false);
      {
        toast.error(up.error.message);
        return;
      }
    }
    const { error } = await supabase
      .from("projects")
      .update({ banner_file_path: path, banner_file_name: file.name })
      .eq("id", projectId);
    if (error) {
      await supabase.storage.from(BUCKET).remove([path]);
      setUploading(false);
      {
        toast.error(error.message);
        return;
      }
    }
    if (filePath) await supabase.storage.from(BUCKET).remove([filePath]);
    await logContribution("banner_file_path", file.size > 0 ? 1000 : 0);
    setUploading(false);
    toast.success("Arquivo do banner enviado");
    qc.invalidateQueries({ queryKey: ["group", groupId] });
    // A copy also goes to the teacher's Google Drive folder; the upload already succeeded, so failures stay quiet.
    copyToDrive({ data: { groupId } }).catch((e) => console.warn("Banner Drive copy failed", e));
  }

  return (
    <div className="space-y-6">
      <BannerBriefView brief={brief} />

      <div className="space-y-2">
        <Label htmlFor="banner-link">Link do banner no Canva</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="banner-link"
            value={link}
            disabled={!editable}
            placeholder="https://www.canva.com/design/..."
            onChange={(e) => setLink(e.target.value)}
          />
          {editable && (
            <Button
              type="button"
              variant="outline"
              onClick={saveLink}
              disabled={!linkDirty || linkInvalid || savingLink}
            >
              {savingLink ? <Loader2 className="animate-spin" /> : <Save />} Salvar link
            </Button>
          )}
        </div>
        <p className={linkInvalid ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
          {linkIsTemplate
            ? TEMPLATE_LINK_PROBLEM
            : linkInvalid
              ? "O link precisa ser do Canva (começa com https://www.canva.com/)."
              : "Na cópia do grupo: Compartilhar → copiar link (deixe a professora com acesso de visualização)."}
        </p>
      </div>

      <div className="space-y-2">
        <Label>Arquivo final do banner</Label>
        <div className="flex flex-wrap items-center gap-3">
          {filePath ? (
            <BannerFileLink path={filePath} name={fileName} />
          ) : (
            <span className="text-sm italic text-muted-foreground">Nenhum arquivo enviado.</span>
          )}
          {editable && (
            <>
              <input
                ref={fileInput}
                type="file"
                accept={ACCEPT}
                className="hidden"
                aria-label="Arquivo do banner"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void upload(f);
                }}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
              >
                {uploading ? <Loader2 className="animate-spin" /> : <FileUp />}{" "}
                {filePath ? "Trocar arquivo" : "Enviar arquivo"}
              </Button>
            </>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          No Canva: Compartilhar → Baixar → PDF para impressão (ou PNG/JPG). Até 25 MB.
        </p>
      </div>
    </div>
  );
}
