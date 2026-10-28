import { isCanvaUrl, isTemplateLink } from "./phase-rules";

/** Sections suggested for a science-fair banner, in reading order. */
export const DEFAULT_BANNER_SECTIONS = [
  "Título e integrantes",
  "Introdução",
  "Objetivos",
  "Metodologia",
  "Resultados e discussão",
  "Conclusão",
  "Referências",
] as const;

export const BANNER_SIZES = ["90 × 120 cm", "60 × 90 cm", "80 × 100 cm", "A1 (59,4 × 84,1 cm)", "A0 (84,1 × 118,9 cm)"] as const;
export const DEFAULT_BANNER_SIZE = BANNER_SIZES[0];

export type BannerBrief = {
  templateUrl: string | null;
  size: string;
  sections: string[];
  instructions: string;
  /** The group can start: the class has a valid Canva template link. */
  ready: boolean;
};

type ClassBannerFields = {
  banner_template_url?: string | null;
  banner_size?: string | null;
  banner_sections?: string[] | null;
  banner_instructions?: string | null;
};

/** What the group sees on the banner stage, filling in defaults for anything the teacher left blank. */
export function bannerBrief(c: ClassBannerFields): BannerBrief {
  const url = c.banner_template_url?.trim() || null;
  const sections = (c.banner_sections ?? null)?.map((s) => s.trim()).filter(Boolean);
  return {
    templateUrl: url,
    size: c.banner_size?.trim() || DEFAULT_BANNER_SIZE,
    sections: sections && sections.length > 0 ? sections : [...DEFAULT_BANNER_SECTIONS],
    instructions: c.banner_instructions?.trim() ?? "",
    ready: isCanvaUrl(url),
  };
}

export type BannerProgress = "sem_inicio" | "link_do_modelo" | "editando" | "arquivo_enviado" | "entregue";

export const BANNER_PROGRESS_LABEL: Record<BannerProgress, string> = {
  sem_inicio: "Não começou",
  link_do_modelo: "Colou o link do modelo",
  editando: "Montando no Canva",
  arquivo_enviado: "Arquivo enviado",
  entregue: "Entregue",
};

/** Where a group is on the banner, from what it saved in PamLab (Canva itself does not tell us who is editing). */
export function bannerProgress(p: {
  templateUrl: string | null | undefined;
  canvaUrl: string | null | undefined;
  filePath: string | null | undefined;
  delivered: boolean;
}): BannerProgress {
  if (p.delivered) return "entregue";
  if (p.filePath) return "arquivo_enviado";
  if (!isCanvaUrl(p.canvaUrl)) return "sem_inicio";
  if (isTemplateLink(p.canvaUrl, p.templateUrl)) return "link_do_modelo";
  return "editando";
}
