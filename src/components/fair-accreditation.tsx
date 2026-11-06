import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, FileUp, Loader2, PartyPopper, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { safeFileName } from "@/components/banner-stage";
import { fmtDateTime } from "@/lib/format";
import { DOC_STATUS_LABEL, FAIR_DOCS, FAIR_STATUS_LABEL, accreditationComplete } from "@/lib/fair-docs";

const BUCKET = "fair-docs";

export function useFairData(groupId: string) {
  return useQuery({
    queryKey: ["fair-accreditation", groupId],
    queryFn: async () => {
      const [a, d] = await Promise.all([
        supabase.from("fair_approvals").select("*").eq("group_id", groupId).maybeSingle(),
        supabase.from("fair_documents").select("*").eq("group_id", groupId),
      ]);
      if (a.error) throw a.error;
      if (d.error) throw d.error;
      return { approval: a.data, docs: d.data ?? [] };
    },
  });
}

async function openDoc(path: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
  if (error || !data) { toast.error("Não foi possível abrir o arquivo."); return; }
  window.open(data.signedUrl, "_blank", "noopener");
}

async function downloadTemplate(key: string) {
  // Prefer the model the teacher uploaded; fall back to the built-in Word text.
  const { data: own } = await supabase.from("fair_doc_templates").select("file_path").eq("doc_type", key).limit(1).maybeSingle();
  if (own?.file_path) { await openDoc(own.file_path); return; }
  const doc = FAIR_DOCS.find((d) => d.key === key)!;
  const { buildEthicsDocx } = await import("@/lib/ethics-docx");
  const blob = await buildEthicsDocx(doc.template);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${doc.label.replace(/[^\wÀ-ú]+/g, "_")}.docx`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Key used in fair_doc_templates for an external fair's official banner model. */
export const bannerModelKey = (fair: string) => `banner:${fair}`;

/** Student: download the official banner model the teacher uploaded for a fair. */
export async function downloadBannerModel(fair: string) {
  const { data } = await supabase.from("fair_doc_templates").select("file_path").eq("doc_type", bannerModelKey(fair)).limit(1).maybeSingle();
  if (!data?.file_path) { toast.error("A professora ainda não enviou o modelo desta feira."); return; }
  await openDoc(data.file_path);
}

/** Teacher: upload the official banner model of each external fair. */
export function FairBannerModelsManager({ fairs }: { fairs: readonly string[] }) {
  return <TemplateList title="Modelos oficiais de banner" text="Envie o modelo de banner de cada feira quando quiser (PDF, PPTX, Word ou imagem). Somente os grupos aprovados pela professora baixam o modelo das feiras selecionadas." items={fairs.map((f) => ({ key: bannerModelKey(f), label: `Banner ${f}` }))} />;
}

/** Teacher: upload her own model file for each accreditation document (used by all her groups). */
export function FairTemplatesManager() {
  return <TemplateList title="Modelos dos documentos da feira" text="Envie seus próprios modelos (Word, PDF ou imagem). Os grupos aprovados baixam o seu arquivo; sem modelo enviado, usam o padrão do FECITI Flow." items={FAIR_DOCS.map((d) => ({ key: d.key, label: d.label, builtIn: true }))} />;
}

function TemplateList({ title, text, items }: { title: string; text: string; items: { key: string; label: string; builtIn?: boolean }[] }) {
  const qc = useQueryClient();
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const { data: rows = [] } = useQuery({
    queryKey: ["fair-templates"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase.from("fair_doc_templates").select("*").eq("teacher_id", u.user?.id ?? "");
      if (error) throw error;
      return data ?? [];
    },
  });
  async function upload(key: string, file: File) {
    if (file.size > 15 * 1024 * 1024) { toast.error("Arquivo maior que 15 MB."); return; }
    setBusy(key);
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (!uid) { setBusy(null); return; }
    const path = `templates/${uid}/${key}-${Date.now()}-${safeFileName(file.name)}`;
    const up = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
    if (up.error) { setBusy(null); toast.error("Falha no envio do modelo."); return; }
    const { error } = await supabase.from("fair_doc_templates").upsert({ teacher_id: uid, doc_type: key, file_path: path, file_name: file.name, uploaded_at: new Date().toISOString() });
    setBusy(null);
    if (error) { toast.error("Não foi possível salvar o modelo."); return; }
    toast.success("Modelo salvo. Os grupos aprovados já baixam este arquivo.");
    qc.invalidateQueries({ queryKey: ["fair-templates"] });
  }
  async function remove(key: string) {
    const row = rows.find((r) => r.doc_type === key);
    if (!row) return;
    await supabase.storage.from(BUCKET).remove([row.file_path]);
    await supabase.from("fair_doc_templates").delete().eq("teacher_id", row.teacher_id).eq("doc_type", key);
    toast.success("Modelo removido.");
    qc.invalidateQueries({ queryKey: ["fair-templates"] });
  }
  return (
    <div className="card-paper space-y-3 p-5">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{text}</p>
      <ul className="space-y-2">
        {items.map((d) => {
          const row = rows.find((r) => r.doc_type === d.key);
          return (
            <li key={d.key} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">{d.label}</p>
                <p className="text-xs text-muted-foreground">{row ? `Seu modelo: ${row.file_name}` : d.builtIn ? "Usando o modelo padrão do FECITI Flow" : "Nenhum modelo enviado ainda"}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(row || d.builtIn) && <Button size="sm" variant="ghost" onClick={() => (row ? openDoc(row.file_path) : downloadTemplate(d.key))}><Download /> Ver</Button>}
                <input
                  ref={(el) => { inputs.current[d.key] = el; }}
                  type="file"
                  accept=".doc,.docx,.pdf,.odt,.ppt,.pptx,image/png,image/jpeg"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(d.key, f); e.target.value = ""; }}
                />
                <Button size="sm" onClick={() => inputs.current[d.key]?.click()} disabled={busy === d.key}>
                  {busy === d.key ? <Loader2 className="animate-spin" /> : <FileUp />} {row ? "Trocar modelo" : "Enviar meu modelo"}
                </Button>
                {row && <Button size="sm" variant="outline" onClick={() => remove(d.key)}><RotateCcw /> {d.builtIn ? "Usar padrão" : "Remover"}</Button>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const toLocalInput = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

/** Teacher: approve the group for the fair and check each accreditation document. */
export function TeacherFairPanel({ groupId }: { groupId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useFairData(groupId);
  const [status, setStatus] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [due, setDue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (isLoading || !data) return <Loader2 className="animate-spin" />;
  const { approval, docs } = data;
  const s = status ?? approval?.status ?? "aprovado";

  async function save() {
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const dueVal = due ?? toLocalInput(approval?.docs_due_at);
    const { error } = await supabase.from("fair_approvals").upsert({
      group_id: groupId,
      status: s,
      note: (note ?? approval?.note ?? "").trim() || null,
      docs_due_at: dueVal ? new Date(dueVal).toISOString() : null,
      teacher_id: u.user?.id ?? null,
      decided_at: new Date().toISOString(),
    });
    setBusy(false);
    if (error) { toast.error("Não foi possível salvar a decisão."); return; }
    toast.success("Decisão salva. O grupo já vê na área dele.");
    qc.invalidateQueries({ queryKey: ["fair-accreditation", groupId] });
  }

  async function review(id: string, st: "conferido" | "refazer", teacher_note?: string) {
    const { error } = await supabase.from("fair_documents").update({ status: st, teacher_note: teacher_note ?? null }).eq("id", id);
    if (error) { toast.error("Não foi possível atualizar o documento."); return; }
    qc.invalidateQueries({ queryKey: ["fair-accreditation", groupId] });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Aprovação para a feira</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Decisão</Label>
            <Select value={s} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(FAIR_STATUS_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Prazo para enviar os documentos</Label>
            <Input type="datetime-local" value={due ?? toLocalInput(approval?.docs_due_at)} onChange={(e) => setDue(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Recado ao grupo (opcional)</Label>
          <Textarea value={note ?? approval?.note ?? ""} onChange={(e) => setNote(e.target.value)} />
        </div>
        <Button onClick={save} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Save />} {approval ? "Atualizar decisão" : "Salvar decisão"}
        </Button>
      </div>

      {approval?.status === "aprovado" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">Documentos do credenciamento</h3>
            {accreditationComplete(docs) && <Badge><CheckCircle2 className="size-3" /> Credenciamento completo</Badge>}
          </div>
          <ul className="space-y-2">
            {FAIR_DOCS.map((d) => {
              const doc = docs.find((x) => x.doc_type === d.key);
              return (
                <li key={d.key} className="flex flex-wrap items-center gap-2 rounded-md border p-3">
                  <span className="flex-1 font-medium">{d.label}</span>
                  {!doc ? (
                    <span className="text-sm italic text-muted-foreground">Ainda não enviado</span>
                  ) : (
                    <>
                      <Badge variant={doc.status === "conferido" ? "default" : doc.status === "refazer" ? "destructive" : "secondary"}>
                        {DOC_STATUS_LABEL[doc.status]}
                      </Badge>
                      <Button size="sm" variant="outline" onClick={() => openDoc(doc.file_path)}><Download /> Abrir</Button>
                      <Button size="sm" onClick={() => review(doc.id, "conferido")}><CheckCircle2 /> Conferido</Button>
                      <Button size="sm" variant="outline" onClick={() => {
                        const why = window.prompt("O que o grupo precisa corrigir?") ?? "";
                        review(doc.id, "refazer", why);
                      }}><RotateCcw /> Refazer</Button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Student: sees the fair decision, downloads templates and uploads signed documents. */
export function StudentFairCard({ groupId }: { groupId: string }) {
  const qc = useQueryClient();
  const { data } = useFairData(groupId);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  if (!data?.approval) return null;
  const { approval, docs } = data;

  async function upload(key: string, file: File) {
    if (file.size > 15 * 1024 * 1024) { toast.error("O arquivo passa de 15 MB."); return; }
    setBusyKey(key);
    const { data: u } = await supabase.auth.getUser();
    const path = `${groupId}/${key}-${Date.now()}-${safeFileName(file.name)}`;
    const up = await supabase.storage.from(BUCKET).upload(path, file);
    if (up.error) {
      setBusyKey(null);
      toast.error("Não foi possível enviar o arquivo.");
      return;
    }
    const { error } = await supabase.from("fair_documents").upsert(
      { group_id: groupId, doc_type: key, file_path: path, file_name: file.name, uploaded_by: u.user?.id ?? null, status: "enviado", teacher_note: null, uploaded_at: new Date().toISOString() },
      { onConflict: "group_id,doc_type" },
    );
    setBusyKey(null);
    if (error) { toast.error("Não foi possível registrar o documento."); return; }
    toast.success("Documento enviado para a professora conferir.");
    qc.invalidateQueries({ queryKey: ["fair-accreditation", groupId] });
  }

  return (
    <div className="card-paper space-y-3 p-5">
      <h3 className="flex items-center gap-2 text-lg font-semibold">
        {approval.status === "aprovado" && <PartyPopper className="size-5 text-primary" />}
        {FAIR_STATUS_LABEL[approval.status]}
      </h3>
      {approval.note && <p className="text-sm">{approval.note}</p>}
      {approval.status === "aprovado" && (
        <>
          {approval.docs_due_at && (
            <p className="text-sm text-muted-foreground">Envie os documentos assinados até <b>{fmtDateTime(approval.docs_due_at)}</b>.</p>
          )}
          <ul className="space-y-3">
            {FAIR_DOCS.map((d) => {
              const doc = docs.find((x) => x.doc_type === d.key);
              const locked = doc?.status === "conferido";
              return (
                <li key={d.key} className="space-y-1 rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{d.label}</span>
                    {doc && <Badge variant={doc.status === "refazer" ? "destructive" : doc.status === "conferido" ? "default" : "secondary"}>{DOC_STATUS_LABEL[doc.status]}</Badge>}
                  </div>
                  {doc?.status === "refazer" && doc.teacher_note && <p className="text-xs text-destructive">{doc.teacher_note}</p>}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => downloadTemplate(d.key)}><Download /> Modelo</Button>
                    {doc && <Button size="sm" variant="ghost" onClick={() => openDoc(doc.file_path)}>Ver enviado</Button>}
                    {!locked && (
                      <>
                        <input
                          ref={(el) => { inputs.current[d.key] = el; }}
                          type="file"
                          accept="application/pdf,image/png,image/jpeg"
                          className="hidden"
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(d.key, f); e.target.value = ""; }}
                        />
                        <Button size="sm" onClick={() => inputs.current[d.key]?.click()} disabled={busyKey === d.key}>
                          {busyKey === d.key ? <Loader2 className="animate-spin" /> : <FileUp />} {doc ? "Reenviar" : "Enviar assinado"}
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
