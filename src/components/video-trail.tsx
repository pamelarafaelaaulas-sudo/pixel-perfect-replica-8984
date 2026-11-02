import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, FileDown, Highlighter, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DEFAULT_HIGHLIGHTED_ARTICLE, HIGHLIGHT_COLORS, videoEmbedUrl } from "@/lib/diary";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

function VideoFrame({ url, title }: { url: string; title: string }) {
  const embed = videoEmbedUrl(url);
  if (!embed)
    return (
      <Button asChild variant="secondary" size="sm">
        <a href={url} target="_blank" rel="noreferrer">
          <PlayCircle /> Assistir ao vídeo <ExternalLink className="size-3" />
        </a>
      </Button>
    );
  return (
    <div className="aspect-video w-full overflow-hidden rounded-lg border border-border bg-muted">
      <iframe
        src={embed}
        title={title}
        className="size-full"
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        loading="lazy"
      />
    </div>
  );
}

/** Stage 1 (before the research): mandatory video on how to keep a good Diário de Bordo. */
export function DiaryVideoStep({
  url,
  projectId,
  groupId,
  watchedAt,
  editable,
}: {
  url: string | null;
  projectId: string;
  groupId: string;
  watchedAt: string | null;
  editable: boolean;
}) {
  const qc = useQueryClient();
  const mark = useMutation({
    mutationFn: async (on: boolean) => {
      const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
      const { error } = await supabase
        .from("projects")
        .update(on ? { diary_video_watched_at: new Date().toISOString(), diary_video_watched_by: uid } : { diary_video_watched_at: null, diary_video_watched_by: null })
        .eq("id", projectId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["group", groupId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <p className="flex items-center gap-2 font-medium text-foreground">
        <PlayCircle className="size-5 text-primary" /> Vídeo obrigatório: como fazer um bom Diário de Bordo
      </p>
      <p className="text-sm text-muted-foreground">
        Antes de começar a pesquisa: o diário precisa de registros contínuos, datados e honestos — com os acertos, os erros e as
        mudanças de rota.
      </p>
      {url ? (
        <>
          <VideoFrame url={url} title="Como fazer um bom Diário de Bordo" />
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={!!watchedAt}
              disabled={!editable || mark.isPending}
              onCheckedChange={(c) => mark.mutate(c === true)}
              aria-label="Assistimos ao vídeo do Diário de Bordo"
            />
            Assistimos ao vídeo do Diário de Bordo
            {watchedAt && <span className="text-xs text-muted-foreground">({fmtDateTime(watchedAt)})</span>}
          </label>
        </>
      ) : (
        <p className="text-sm italic text-muted-foreground">A professora ainda não colocou o vídeo.</p>
      )}
    </section>
  );
}

const SWATCH: Record<(typeof HIGHLIGHT_COLORS)[number]["token"], string> = {
  highlight: "bg-highlight",
  success: "bg-success/40",
  info: "bg-info/50",
};

/** End of the research (Referências): video on organizing the references folder + highlight colors + model article. */
export function ReferencesVideoStep({ url, articleUrl }: { url: string | null; articleUrl: string | null }) {
  return (
    <section className="space-y-3 rounded-lg border border-info/40 bg-info/5 p-4">
      <p className="flex items-center gap-2 font-medium text-foreground">
        <Highlighter className="size-5 text-info" /> Organize a pasta de referências e de campo
      </p>
      {url ? (
        <VideoFrame url={url} title="Como organizar a pasta de referências" />
      ) : (
        <p className="text-sm italic text-muted-foreground">A professora ainda não colocou o vídeo.</p>
      )}
      <div>
        <p className="mb-2 text-sm font-medium text-foreground">Padrão de grifos nos artigos científicos</p>
        <ul className="grid gap-2 sm:grid-cols-3">
          {HIGHLIGHT_COLORS.map((h) => (
            <li key={h.color} className="flex items-center gap-2 rounded-lg bg-card p-2 text-sm">
              <span className={cn("h-4 w-8 shrink-0 rounded", SWATCH[h.token])} aria-hidden />
              <span>
                <strong>{h.color}:</strong> <span className="text-muted-foreground">{h.meaning}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <Button asChild variant="outline" size="sm">
        <a href={articleUrl?.trim() || DEFAULT_HIGHLIGHTED_ARTICLE} target="_blank" rel="noreferrer" download={!articleUrl?.trim()}>
          <FileDown /> Baixar artigo modelo já grifado (PDF)
        </a>
      </Button>
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <CheckCircle2 className="size-3" /> Guarde na pasta do projeto os artigos grifados, as anotações de campo e os termos assinados.
      </p>
    </section>
  );
}
