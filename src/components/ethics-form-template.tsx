import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ClipboardCopy, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formsConsentText, isGoogleFormUrl } from "@/lib/ethics";

/** Teacher: the Google Forms model (header + TCLE) that groups copy for online collection — one link for all her classes. */
export function EthicsFormTemplateDialog({
  teacherId,
  classes,
}: {
  teacherId: string;
  classes: { ethics_form_template_url?: string | null }[];
}) {
  const qc = useQueryClient();
  const current = classes.find((c) => c.ethics_form_template_url)?.ethics_form_template_url ?? "";
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(current);
  const invalid = url.trim() !== "" && !isGoogleFormUrl(url);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("classes")
        .update({ ethics_form_template_url: url.trim() || null })
        .eq("teacher_id", teacherId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Modelo do formulário salvo para todas as turmas");
      qc.invalidateQueries({ queryKey: ["teacher", "classes"] });
      qc.invalidateQueries({ queryKey: ["group"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sample = formsConsentText({
    title: "[Título do projeto]",
    projectCode: "[código]",
    institution: "[Escola]",
    students: [],
    teacherName: "[Professora]",
    objective: "[objetivo geral do projeto]",
    year: new Date().getFullYear(),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setUrl(current);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <ShieldCheck /> Modelo do TCLE (Forms)
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Modelo do Google Forms com TCLE</DialogTitle>
          <DialogDescription>
            Na Metodologia, os grupos que vão coletar dados online abrem este modelo, fazem uma cópia e colam o link do formulário
            deles. Vale para todas as suas turmas.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="ethics-template">Link do modelo no Google Forms</Label>
          <Input id="ethics-template" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/forms/d/.../copy" />
          <p className={invalid ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
            {invalid
              ? "O link precisa ser do Google Forms."
              : "Dica: troque o final do link de edição por /copy para o aluno já cair em “Fazer uma cópia”."}
          </p>
        </div>
        <div className="space-y-2 rounded-lg bg-muted p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Texto sugerido para a descrição do modelo</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => navigator.clipboard.writeText(sample).then(() => toast.success("Copiado!"))}
            >
              <ClipboardCopy /> Copiar
            </Button>
          </div>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{sample}</pre>
        </div>
        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={invalid || save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
