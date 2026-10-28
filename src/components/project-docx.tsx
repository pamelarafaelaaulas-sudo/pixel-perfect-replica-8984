import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { buildAbntModel, docxFileName } from "@/lib/abnt-doc";
import { downloadBlob } from "@/lib/export-xlsx";
import { areaLabel, projectCode } from "@/lib/project-code";

type Project = Database["public"]["Tables"]["projects"]["Row"];

type Props = {
  project: Project;
  groupName: string;
  authors: string[];
  cls: { class_code: string; code_label: string | null };
};

type Ready = { blob: Blob; name: string; missing: string[] };

/** Opens a dialog that builds the ABNT Word file, then downloads it on click (keeps the click instant on every browser). */
export function ProjectDocxButton(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileDown /> Baixar em Word (ABNT)
        </Button>
      </DialogTrigger>
      <DialogContent>{open && <DocxPanel {...props} />}</DialogContent>
    </Dialog>
  );
}

function DocxPanel({ project, groupName, authors, cls }: Props) {
  const [ready, setReady] = useState<Ready | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const teacher = await supabase.rpc("find_class", { _code: cls.class_code });
        const code = projectCode(project.area_code, cls.code_label, project.project_seq);
        const model = buildAbntModel({
          ...project,
          authors: [...authors].sort((a, b) => a.localeCompare(b, "pt-BR")),
          teacherName: teacher.data?.[0]?.teacher_name ?? null,
          areaLabel: areaLabel(project.area_code),
          projectCode: code,
          year: new Date().getFullYear(),
        });
        const { buildProjectDocx } = await import("@/lib/abnt-docx");
        const blob = await buildProjectDocx(model);
        if (alive) setReady({ blob, name: docxFileName(code, groupName, project.title), missing: model.missing });
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    })();
    return () => {
      alive = false;
    };
    // Rebuild only when the saved text, authors or code parts change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, project.updated_at, project.area_code, groupName, authors.join("|"), cls.class_code, cls.code_label]);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="font-display text-2xl">Projeto em Word</DialogTitle>
        <DialogDescription>
          Formatado nas normas ABNT: folha A4, margens 3 cm (superior e esquerda) e 2 cm, Arial 12, espaçamento 1,5,
          capa, folha de rosto, resumo, seções numeradas e referências em ordem alfabética. Usa o texto já salvo.
        </DialogDescription>
      </DialogHeader>
      {error ? (
        <p className="text-sm text-destructive">Não foi possível montar o arquivo: {error}</p>
      ) : !ready ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Montando o documento…
        </p>
      ) : (
        <div className="space-y-4">
          {ready.missing.length > 0 ? (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <AlertTriangle className="size-4 text-warning" /> Partes ainda vazias
              </p>
              <p className="mt-1 text-muted-foreground">
                {ready.missing.join(", ")}. Elas aparecem no arquivo como “[Parte ainda não escrita]”.
              </p>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm text-success">
              <CheckCircle2 className="size-4" /> Todas as partes estão preenchidas.
            </p>
          )}
          <Button className="w-full" onClick={() => downloadBlob(ready.blob, ready.name)}>
            <FileDown /> Baixar {ready.name}
          </Button>
        </div>
      )}
    </>
  );
}
