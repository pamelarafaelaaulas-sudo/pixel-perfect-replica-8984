import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ updates: [] as Record<string, unknown>[], evaluations: [] as Record<string, unknown>[], calls: [] as { bytes: number; context: string }[] }));
const groupId = "00000000-0000-4000-8000-000000000001";
const goldId = "00000000-0000-4000-8000-000000000002";
const entries = (group: string) => Array.from({ length: 4 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i + 10).padStart(12, "0")}`, entry_date: "2026-11-16", photo_path: `${group}/${i}.jpg` }));

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from: (table: string) => {
    let updating = false;
    const query = {
      select: () => query, eq: () => query, in: () => query,
      update: (values: Record<string, unknown>) => { updating = true; state.updates.push(values); return query; },
      insert: async (values: Record<string, unknown>) => { state.evaluations.push(values); return { error: null }; },
      single: async () => ({ data: { entries_snapshot: entries(groupId), photo_validation: "not_requested" }, error: null }),
      maybeSingle: async () => ({ data: updating ? { id: "claimed" } : table === "diary_gold_standards" ? { group_id: goldId, submission_id: "reference", entries_snapshot: entries(goldId) } : null, error: null }),
      then: (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve),
    };
    return query;
  },
  storage: { from: () => ({ download: async () => ({ data: new Blob([new Uint8Array(10 * 1024 * 1024)], { type: "image/jpeg" }), error: null }) }) },
} }));
vi.mock("./gemini.server", () => ({ geminiModel: () => "mock", GEMINI_OPTIONS: {} }));
vi.mock("ai", () => ({ Output: { object: () => ({}) }, streamText: (input: { messages: { content: { type: string; text?: string; image?: Uint8Array }[] }[] }) => {
  const content = input.messages[0]?.content ?? [];
  state.calls.push({ bytes: content.reduce((sum, item) => sum + (item.image?.byteLength ?? 0), 0), context: content[0]?.text ?? "" });
  const pages = content.filter(item => item.text?.startsWith("CADERNO A AVALIAR:")).map(item => ({ id: item.text?.match(/página ([\w-]+)/)?.[1], readable: true, dated: true, date_matches: true, reason: "" }));
  return { output: Promise.resolve({ axes: { continuidade: 8, organizacao: 8, conteudo: 8, reflexao: 8 }, comparison: "Organizado.", feedback: "Descreva os próximos passos.", pages }) };
} }));

beforeEach(() => { state.updates.length = 0; state.evaluations.length = 0; state.calls.length = 0; });
it("saves validation and a private grade for 40 MB current plus 40 MB gold photos", async () => {
  const { evaluateDiaryPhotos } = await import("./diary-evaluation.server");
  await expect(evaluateDiaryPhotos("submission", groupId, "teacher")).resolves.toEqual({ validated: true });
  expect(state.calls).toHaveLength(4);
  expect(state.calls.every(call => call.bytes <= 20 * 1024 * 1024)).toBe(true);
  expect(state.calls[2]?.context).toContain("Resumo observado de TODOS os lotes");
  expect(state.evaluations[0]).toMatchObject({ score: 8, validated: true, reference_submission_id: "reference" });
  expect(state.updates.at(-1)).toMatchObject({ ai_status: "complete", photo_validation: "validated", status: "approved" });
});