import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Clapperboard, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DEFAULT_HIGHLIGHTED_ARTICLE, isVideoLink } from "@/lib/diary";
import { endOfDayFromInput } from "@/lib/format";

type Cls = {
  diary_video_url?: string | null;
  references_video_url?: string | null;
  highlighted_article_url?: string | null;
  diary_review_start?: string | null;
  diary_review_end?: string | null;
};

const startOfDayFromInput = (v: string) => {
  const [y = 1970, m = 1, d = 1] = v.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0).toISOString();
};

/** Teacher: the two trail videos, the model article and the diary review period (3rd bimestre), for all her classes. */
export function TrailSettingsDialog({ teacherId, classes }: { teacherId: string; classes: Cls[] }) {
  const qc = useQueryClient();
  const pick = <K extends keyof Cls>(k: K) => (classes.find((c) => c[k])?.[k] as string | null | undefined) ?? "";
  const [open, setOpen] = useState(false);
  const [diaryVideo, setDiaryVideo] = useState("");
  const [refVideo, setRefVideo] = useState("");
  const [article, setArticle] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  function reset() {
    setDiaryVideo(pick("diary_video_url"));
    setRefVideo(pick("references_video_url"));
    setArticle(pick("highlighted_article_url"));
    const s = pick("diary_review_start");
    const e = pick("diary_review_end");
    setStart(s ? format(new Date(s), "yyyy-MM-dd") : "");
    setEnd(e ? format(new Date(e), "yyyy-MM-dd") : "");
  }

  const bad = (v: string) => v.trim() !== "" && !isVideoLink(v);
  const periodBad = (start === "") !== (end === "") || (start !== "" && end !== "" && start > end);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("classes")
        .update({
          diary_video_url: diaryVideo.trim() || null,
          references_video_url: refVideo.trim() || null,
          highlighted_article_url: article.trim() || null,
          diary_review_start: start ? startOfDayFromInput(start) : null,
          diary_review_end: end ? endOfDayFromInput(end) : null,
        })
        .eq("teacher_id", teacherId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Trilha de vídeos e período do diário salvos para todas as turmas");
      qc.invalidateQueries({ queryKey: ["teacher", "classes"] });
      qc.invalidateQueries({ queryKey: ["group"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Clapperboard /> Vídeos e diário
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Trilha de vídeos e diário de bordo</DialogTitle>
          <DialogDescription>Vale para todas as suas turmas. Links do YouTube, Vimeo ou Google Drive aparecem com o vídeo na tela.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="trail-diary">Vídeo 1 — Como fazer um bom Diário de Bordo (etapa Tema, obrigatório)</Label>
            <Input id="trail-diary" value={diaryVideo} onChange={(e) => setDiaryVideo(e.target.value)} placeholder="https://youtu.be/..." />
            {bad(diaryVideo) && <p className="text-xs text-destructive">Cole um link que comece com https://</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="trail-refs">Vídeo 2 — Pasta de referências e grifos (etapa Referências)</Label>
            <Input id="trail-refs" value={refVideo} onChange={(e) => setRefVideo(e.target.value)} placeholder="https://youtu.be/..." />
            {bad(refVideo) && <p className="text-xs text-destructive">Cole um link que comece com https://</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="trail-article">Artigo grifado de modelo (PDF, opcional)</Label>
            <Input id="trail-article" value={article} onChange={(e) => setArticle(e.target.value)} placeholder="Link do Google Drive" />
            <p className="text-xs text-muted-foreground">
              Sem link, os alunos baixam o{" "}
              <a href={DEFAULT_HIGHLIGHTED_ARTICLE} target="_blank" rel="noreferrer" className="text-primary underline">
                modelo do FECITI Flow
              </a>
              .
            </p>
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Avaliação do diário (3º bimestre)</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="trail-start" className="text-xs">
                  Começa em
                </Label>
                <Input id="trail-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="trail-end" className="text-xs">
                  Termina em
                </Label>
                <Input id="trail-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>
            <p className={periodBad ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
              {periodBad
                ? "Preencha as duas datas, com o início antes do fim."
                : "Em branco: vai do prazo do Resumo (fim do 2º bimestre) até o prazo do Banner (fim do 3º). A aba do diário só aparece nesse período."}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={save.isPending || bad(diaryVideo) || bad(refVideo) || periodBad}>
            {save.isPending && <Loader2 className="animate-spin" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
