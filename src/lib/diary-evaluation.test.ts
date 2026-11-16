import { describe, expect, it } from "vitest";
import { analyzeDiaryBatches, combineDiaryBatches, DIARY_BATCH_BYTES, DIARY_PHOTO_TYPES, diaryPhotosValidated, diaryPreliminaryScore, diaryStudentFeedback, type DiaryImage } from "./diary-evaluation";
describe("diary preliminary assessment", () => {
  it("keeps the preliminary grade on the 0–10 scale", () => {
    expect(diaryPreliminaryScore({ continuidade: 10, organizacao: 10, conteudo: 10, reflexao: 10 })).toBe(10);
    expect(diaryPreliminaryScore({ continuidade: 8, organizacao: 6, conteudo: 10, reflexao: 4 })).toBe(7);
  });
  it("validates only when every uploaded page is readable and has the matching date", () => {
    const p = { id: "a", readable: true, dated: true, date_matches: true, reason: "" };
    expect(diaryPhotosValidated(["a"], [p])).toBe(true);
    expect(diaryPhotosValidated(["a", "b"], [p])).toBe(false);
    expect(diaryPhotosValidated(["a"], [{ ...p, date_matches: false }])).toBe(false);
    expect(diaryPhotosValidated(["a"], [{ ...p, readable: false }])).toBe(false);
  });
  it("does not expose preliminary scores in student feedback", () => {
    expect(diaryStudentFeedback("Nota: 8,2. Descreva melhor os resultados.")).toBe("Descreva melhor os resultados.");
  });
  const entries = Array.from({ length: 8 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, entry_date: "2026-11-16", photo_path: `group/${i}.jpg` }));
  const evaluate = async (images: DiaryImage[]) => ({ axes: { continuidade: 8, organizacao: 8, conteudo: 8, reflexao: 8 }, comparison: "Organizado.", feedback: "Registre os próximos passos.", pages: images.map(({ entry }) => ({ id: entry.id, readable: true, dated: true, date_matches: true, reason: "" })) });
  it("evaluates every page of an 80 MB notebook in bounded batches", async () => {
    const batchSizes: number[] = [];
    const out = combineDiaryBatches(await analyzeDiaryBatches(entries, async () => ({ image: new Uint8Array(10 * 1024 * 1024), mediaType: "image/jpeg" }), async images => {
      batchSizes.push(images.reduce((sum, photo) => sum + photo.image.byteLength, 0));
      return evaluate(images);
    }));
    expect(batchSizes).toEqual(Array(8).fill(10 * 1024 * 1024));
    expect(batchSizes.every(bytes => bytes <= DIARY_BATCH_BYTES)).toBe(true);
    expect(diaryPhotosValidated(entries.map(e => e.id), out.pages)).toBe(true);
    expect(diaryPreliminaryScore(out.axes)).toBe(8);
  });
  it("keeps analyzing later pages after an unsupported historical photo", async () => {
    const out = combineDiaryBatches(await analyzeDiaryBatches(entries.slice(0, 3), async entry => ({ image: new Uint8Array(1024), mediaType: entry.id === entries[0]?.id ? "image/tiff" : "image/jpeg" }), evaluate));
    expect(out.pages).toHaveLength(3);
    expect(out.pages[0]?.readable).toBe(false);
    expect(out.pages.slice(1).every(page => page.readable)).toBe(true);
    expect(diaryPhotosValidated(entries.slice(0, 3).map(e => e.id), out.pages)).toBe(false);
  });
  it("accepts HEIC and HEIF for existing and new iPhone photos", async () => {
    expect([...DIARY_PHOTO_TYPES]).toEqual(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
    const out = combineDiaryBatches(await analyzeDiaryBatches(entries.slice(0, 2), async entry => ({ image: new Uint8Array(1024), mediaType: entry.id === entries[0]?.id ? "image/heic" : "image/heif" }), evaluate));
    expect(diaryPhotosValidated(entries.slice(0, 2).map(e => e.id), out.pages)).toBe(true);
  });
  it("does not mark a batch complete when the AI omits a page", async () => {
    await expect(analyzeDiaryBatches(entries.slice(0, 2), async () => ({ image: new Uint8Array(1), mediaType: "image/png" }), async images => evaluate(images.slice(0, 1)))).rejects.toThrow("todas as páginas");
  });
  it("weights each axis by pages instead of uneven batch sizes", () => {
    const one = { axes: { continuidade: 10, organizacao: 10, conteudo: 10, reflexao: 10 }, comparison: "Bom.", feedback: "Continue.", pages: [{ id: "a", readable: true, dated: true, date_matches: true, reason: "" }] };
    expect(combineDiaryBatches([one, { ...one, axes: { continuidade: 6, organizacao: 6, conteudo: 6, reflexao: 6 }, pages: [one.pages[0], one.pages[0], one.pages[0]].filter((p): p is NonNullable<typeof p> => !!p) }]).axes.conteudo).toBe(7);
  });
});