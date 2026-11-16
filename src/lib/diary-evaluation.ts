import { z } from "zod";

export const diaryPhotoEntries = z.array(z.object({ id: z.string().uuid(), entry_date: z.string(), photo_path: z.string().nullable().optional() }));
export const DIARY_AXES = ["continuidade", "organizacao", "conteudo", "reflexao"] as const;
export const diaryEvaluationSchema = z.object({
  axes: z.object({ continuidade: z.number().min(0).max(10), organizacao: z.number().min(0).max(10), conteudo: z.number().min(0).max(10), reflexao: z.number().min(0).max(10) }),
  comparison: z.string().min(1).max(2500),
  feedback: z.string().min(1).max(2500),
  pages: z.array(z.object({ id: z.string().uuid(), readable: z.boolean(), dated: z.boolean(), date_matches: z.boolean(), reason: z.string().max(500) })).min(1),
});
export function diaryPreliminaryScore(axes: z.infer<typeof diaryEvaluationSchema>["axes"]) {
  return Math.round(DIARY_AXES.reduce((sum, key) => sum + axes[key], 0) / 4 * 10) / 10;
}
export function diaryPhotosValidated(ids: string[], pages: z.infer<typeof diaryEvaluationSchema>["pages"]) {
  return ids.length > 0 && pages.length === ids.length && new Set(pages.map(p => p.id)).size === ids.length && ids.every(id => pages.some(p => p.id === id && p.readable && p.dated && p.date_matches));
}
export function diaryStudentFeedback(text: string) {
  return text.split(/\n|(?<=[.!?])\s+/).filter(line => !/\b(nota|pontua[çc][aã]o|score|pontos?|padr[aã]o ouro|refer[eê]ncia nota)\b/i.test(line)).join("\n").trim() || "Confira as orientações de validação das fotos do diário.";
}

export const DIARY_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const DIARY_BATCH_BYTES = 20 * 1024 * 1024;
export type DiaryEvaluation = z.infer<typeof diaryEvaluationSchema>;
export type DiaryPhotoEntry = z.infer<typeof diaryPhotoEntries>[number];
export type DiaryImage = { entry: DiaryPhotoEntry; image: Uint8Array; mediaType: string };

/** Never retain the entire notebook's image bytes or send an oversized request. */
export async function analyzeDiaryBatches(
  entries: DiaryPhotoEntry[],
  download: (entry: DiaryPhotoEntry) => Promise<{ image: Uint8Array; mediaType: string }>,
  analyze: (images: DiaryImage[]) => Promise<DiaryEvaluation>,
): Promise<DiaryEvaluation[]> {
  const results: DiaryEvaluation[] = [];
  let batch: DiaryImage[] = [];
  let bytes = 0;
  const flush = async () => {
    if (!batch.length) return;
    const out = diaryEvaluationSchema.parse(await analyze(batch));
    const ids = batch.map(({ entry }) => entry.id);
    if (out.pages.length !== ids.length || new Set(out.pages.map(p => p.id)).size !== ids.length || out.pages.some(p => !ids.includes(p.id))) {
      throw new Error("A IA não retornou todas as páginas deste lote.");
    }
    results.push(out);
    batch = [];
    bytes = 0;
  };
  for (const entry of entries) {
    const photo = await download(entry);
    if (!DIARY_PHOTO_TYPES.some(type => type === photo.mediaType) || photo.image.byteLength > DIARY_BATCH_BYTES) {
      await flush();
      // Keep incompatible historical pages visible, without poisoning later batches.
      results.push({ axes: { continuidade: 0, organizacao: 0, conteudo: 0, reflexao: 0 }, comparison: "Página não avaliada por incompatibilidade da foto.", feedback: "Envie novamente a página em JPG, PNG ou WEBP.", pages: [{ id: entry.id, readable: false, dated: false, date_matches: false, reason: `Página de ${entry.entry_date}: envie uma nova foto em JPG, PNG ou WEBP.` }] });
      continue;
    }
    if (batch.length && (bytes + photo.image.byteLength > DIARY_BATCH_BYTES || batch.length >= 4)) await flush();
    batch.push({ entry, ...photo });
    bytes += photo.image.byteLength;
  }
  await flush();
  return results;
}

export function combineDiaryBatches(results: DiaryEvaluation[]): DiaryEvaluation {
  const count = results.reduce((sum, result) => sum + result.pages.length, 0);
  if (!count) throw new Error("Nenhuma página foi analisada.");
  const average = (key: typeof DIARY_AXES[number]) => Math.round(results.reduce((sum, result) => sum + result.axes[key] * result.pages.length, 0) / count * 10) / 10;
  return {
    axes: { continuidade: average("continuidade"), organizacao: average("organizacao"), conteudo: average("conteudo"), reflexao: average("reflexao") },
    comparison: results.map(result => result.comparison).join("\n").slice(0, 2500),
    feedback: results.map(result => result.feedback).join("\n").slice(0, 2500),
    pages: results.flatMap(result => result.pages),
  };
}