import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, FolderOpen, Loader2, Palette, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { BannerFileLink } from "@/components/banner-stage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { classBannersQuery } from "@/lib/queries";
import { classDriveFolder, syncClassBanners } from "@/lib/banner-drive.functions";
import { BANNER_PROGRESS_LABEL, bannerProgress, type BannerProgress } from "@/lib/banner";
import { isCanvaUrl, isTemplateLink } from "@/lib/phase-rules";
import { BANNER_PHASE } from "@/lib/phases";
import { projectCode } from "@/lib/project-code";
import { fmtAgo, fmtDateTime } from "@/lib/format";

const BANNER_SECTIONS = ["banner_canva_url", "banner_file_path"];

const BADGE: Record<BannerProgress, "muted" | "warning" | "secondary" | "highlight" | "success"> = {
  sem_inicio: "muted",
  link_do_modelo: "warning",
  editando: "secondary",
  arquivo_enviado: "highlight",
  entregue: "success",
};

/** Teacher: every group's banner in a class — own Canva copy, final file, Drive copy and last activity. */
export function GroupBanners({
  classId,
  templateUrl,
  codeLabel,
}: {
  classId: string;
  templateUrl: string | null;
  codeLabel: string | null;
}) {
  const qc = useQueryClient();
  const groups = useQuery(classBannersQuery(classId));
  const folderFn = useServerFn(classDriveFolder);
  const syncFn = useServerFn(syncClassBanners);
  const drive = useQuery({
    queryKey: ["teacher", "drive", classId],
    queryFn: () => folderFn({ data: { classId } }),
    retry: false,
    staleTime: 5 * 60_000,
  });
  const sync = useMutation({
    mutationFn: () => syncFn({ data: { classId } }),
    onSuccess: (r) => {
      if (r.total === 0) toast.info("Nenhum grupo enviou o arquivo do banner ainda.");
      else toast.success(`Drive atualizado: ${r.synced} enviado(s), ${r.unchanged} já estava(m) lá.`);
      qc.invalidateQueries({ queryKey: ["teacher", "banners", classId] });
    },
    onError: (e: Error) => toast.error(`Não foi possível enviar ao Drive. ${e.message}`),
  });

  const rows = (groups.data ?? []).map((g) => {
    const p = g.projects;
    const delivered = !!p?.phase_submissions.some((s) => s.phase_number === BANNER_PHASE);
    const last = (p?.project_contributions ?? [])
      .filter((c) => BANNER_SECTIONS.includes(c.section_name))
      .sort((a, b) => b.edited_at.localeCompare(a.edited_at))[0];
    const driveCopy = p?.banner_drive_files ?? null;
    return {
      id: g.id,
      name: g.group_name,
      code: p ? projectCode(p.area_code, codeLabel, p.project_seq) : null,
      canvaUrl: p?.banner_canva_url ?? null,
      filePath: p?.banner_file_path ?? null,
      fileName: p?.banner_file_name ?? null,
      progress: bannerProgress({
        templateUrl,
        canvaUrl: p?.banner_canva_url,
        filePath: p?.banner_file_path,
        delivered,
      }),
      last,
      driveCopy,
    };
  });

  return (
    <section className="card-paper mt-6 space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Banners dos grupos</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Cada grupo usa o modelo no Canva e ganha a própria cópia. O Canva não avisa quem está editando, então aqui aparece a
            última vez que o grupo salvou o link ou enviou o arquivo. Abra a cópia do grupo para ver o banner como está agora.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {drive.isPending ? (
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Verificando o Google Drive…
            </span>
          ) : drive.data?.available ? (
            <>
              <Button asChild variant="outline" size="sm">
                <a href={drive.data.folderUrl!} target="_blank" rel="noreferrer">
                  <FolderOpen /> Abrir pasta no Drive <ExternalLink className="size-3" />
                </a>
              </Button>
              <Button size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
                {sync.isPending ? <Loader2 className="animate-spin" /> : <UploadCloud />} Enviar todos ao Drive
              </Button>
            </>
          ) : (
            <p className="max-w-xs text-xs text-muted-foreground">
              {drive.isError
                ? "Não foi possível falar com o Google Drive agora."
                : "A pasta no Google Drive fica na conta da professora que conectou o Drive ao PamLab."}
            </p>
          )}
        </div>
      </div>

      {groups.isPending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Carregando grupos…
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm italic text-muted-foreground">Nenhum grupo nesta turma ainda.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Grupo</th>
                <th className="py-2 pr-3 font-medium">Situação</th>
                <th className="py-2 pr-3 font-medium">Cópia no Canva</th>
                <th className="py-2 pr-3 font-medium">Arquivo final</th>
                <th className="py-2 font-medium">Última atividade</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60 align-top last:border-0">
                  <td className="py-3 pr-3">
                    <p className="font-medium text-foreground">{r.name}</p>
                    {r.code && <p className="font-mono text-xs text-muted-foreground">{r.code}</p>}
                  </td>
                  <td className="py-3 pr-3">
                    <Badge variant={BADGE[r.progress]}>{BANNER_PROGRESS_LABEL[r.progress]}</Badge>
                  </td>
                  <td className="py-3 pr-3">
                    {isCanvaUrl(r.canvaUrl) && !isTemplateLink(r.canvaUrl, templateUrl) ? (
                      <Button asChild variant="outline" size="sm">
                        <a href={r.canvaUrl!} target="_blank" rel="noreferrer">
                          <Palette /> Abrir cópia <ExternalLink className="size-3" />
                        </a>
                      </Button>
                    ) : (
                      <span className="text-xs italic text-muted-foreground">
                        {r.canvaUrl ? "Colou o link do modelo, não o da cópia" : "Ainda sem link"}
                      </span>
                    )}
                  </td>
                  <td className="space-y-1.5 py-3 pr-3">
                    {r.filePath ? (
                      <>
                        <BannerFileLink path={r.filePath} name={r.fileName} />
                        {r.driveCopy ? (
                          <a
                            href={`https://drive.google.com/file/d/${r.driveCopy.drive_file_id}/view`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            No Drive desde {fmtDateTime(r.driveCopy.synced_at)} <ExternalLink className="size-3" />
                          </a>
                        ) : (
                          <p className="text-xs text-muted-foreground">Ainda não está no Drive</p>
                        )}
                      </>
                    ) : (
                      <span className="text-xs italic text-muted-foreground">Não enviado</span>
                    )}
                  </td>
                  <td className="py-3 text-xs text-muted-foreground">
                    {r.last ? (
                      <>
                        <p className="text-foreground">{fmtAgo(r.last.edited_at)}</p>
                        <p>
                          {r.last.section_name === "banner_file_path" ? "enviou o arquivo" : "salvou o link"}
                          {r.last.profiles?.name ? ` · ${r.last.profiles.name}` : ""}
                        </p>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
