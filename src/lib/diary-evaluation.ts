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