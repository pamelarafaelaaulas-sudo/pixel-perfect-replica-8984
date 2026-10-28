import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, ExternalLink, FileUp, Loader2, Palette, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isCanvaUrl } from "@/lib/phase-rules";

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
    if (error || !data) return toast.error("Não foi possível abrir o arquivo do banner.");
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
  if (!canvaUrl && !filePath) return <p className="text-sm italic text-muted-foreground">Ainda não enviado.</p>;
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

/** Student editor for the banner stage: Canva link + final exported file. */
export function BannerStage({
  groupId,
  projectId,
  studentId,
  templateUrl,
  canvaUrl,
  filePath,
  fileName,
  editable,
}: {
  groupId: string;
  projectId: string;
  studentId: string;
  templateUrl: string | null;
  canvaUrl: string | null;
  filePath: string | null;
  fileName: string | null;
  editable: boolean;
}) {
  const qc = useQueryClient();
  const [link, setLink] = useState(canvaUrl ?? "");
  const [savingLink, setSavingLink] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const linkDirty = link.trim() !== (canvaUrl ?? "");
  const linkInvalid = link.trim() !== "" && !isCanvaUrl(link);

  async function logContribution(section: string, chars: number) {
    await supabase
      .from("project_contributions")
      .insert({ project_id: projectId, student_id: studentId, section_name: section, char_count_added: chars });
  }

  async function saveLink() {
    setSavingLink(true);
    const value = link.trim() || null;
    const { error } = await supabase.from("projects").update({ banner_canva_url: value }).eq("id", projectId);
    setSavingLink(false);
    if (error) return toast.error(error.message);
    await logContribution("banner_canva_url", value?.length ?? 0);
    toast.success("Link do Canva salvo");
    qc.invalidateQueries({ queryKey: ["group", groupId] });
  }

  async function upload(file: File) {
    if (!ACCEPT.split(",").includes(file.type)) return toast.error("Envie o banner em PDF, PNG ou JPG.");
    if (file.size > MAX_BYTES) return toast.error("O arquivo passa de 25 MB. Exporte com qualidade menor.");
    setUploading(true);
    const safe = file.name.normalize("NFD").replace(/[^\w.-]+/g, "_").slice(-80);
    const path = `${groupId}/${Date.now()}-${safe}`;
    const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
    if (up.error) {
      setUploading(false);
      return toast.error(up.error.message);
    }
    const { error } = await supabase
      .from("projects")
      .update({ banner_file_path: path, banner_file_name: file.name })
      .eq("id", projectId);
    if (error) {
      await supabase.storage.from(BUCKET).remove([path]);
      setUploading(false);
      return toast.error(error.message);
    }
    if (filePath) await supabase.storage.from(BUCKET).remove([filePath]);
    await logContribution("banner_file_path", file.size > 0 ? 1000 : 0);
    setUploading(false);
    toast.success("Arquivo do banner enviado");
    qc.invalidateQueries({ queryKey: ["group", groupId] });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-muted/50 p-4 text-sm">
        <p className="font-medium text-foreground">Modelo da professora</p>
        {templateUrl ? (
          <>
            <p className="mt-1 text-muted-foreground">
              Abra o modelo, faça uma cópia no Canva e monte o banner do grupo nela.
            </p>
            <Button asChild variant="secondary" size="sm" className="mt-3">
              <a href={templateUrl} target="_blank" rel="noreferrer">
                <Palette /> Abrir modelo no Canva <ExternalLink className="size-3" />
              </a>
            </Button>
          </>
        ) : (
          <p className="mt-1 text-muted-foreground">A professora ainda não colocou o modelo do banner.</p>
        )}
      </div>

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
            <Button type="button" variant="outline" onClick={saveLink} disabled={!linkDirty || linkInvalid || savingLink}>
              {savingLink ? <Loader2 className="animate-spin" /> : <Save />} Salvar link
            </Button>
          )}
        </div>
        <p className={linkInvalid ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
          {linkInvalid
            ? "O link precisa ser do Canva (começa com https://www.canva.com/)."
            : "No Canva: Compartilhar → copiar link (deixe a professora com acesso de visualização)."}
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
              <Button type="button" variant="secondary" onClick={() => fileInput.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="animate-spin" /> : <FileUp />} {filePath ? "Trocar arquivo" : "Enviar arquivo"}
              </Button>
            </>
          )}
        </div>
        <p className="text-xs text-muted-foreground">No Canva: Compartilhar → Baixar → PDF para impressão (ou PNG/JPG). Até 25 MB.</p>
      </div>
    </div>
  );
}
