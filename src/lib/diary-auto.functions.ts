import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { diaryToday } from "./diary";
import { diaryAutoResult, diaryDatesValid } from "./diary-auto";

export const submitDiaryAutomatically = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ groupId: z.string().uuid(), pendingId: z.string().uuid().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: member, error: memberError } = await context.supabase.rpc("is_group_member", { _group_id: data.groupId });
    if (memberError || !member) throw new Error("Somente integrantes do grupo podem enviar o diário.");
    let id = data.pendingId;
    if (!id) {
      const submitted = await context.supabase.rpc("submit_group_diary", { _group_id: data.groupId });
      if (submitted.error) throw new Error(submitted.error.message);
      id = submitted.data;
    }
    const { data: submission, error } = await context.supabase.from("diary_submissions").select("*").eq("id", id).eq("group_id", data.groupId).single();
    if (error || !submission) throw new Error("Envio do diário não encontrado.");
    if (data.pendingId && submission.status !== "pending") return { approved: submission.status === "approved" };
    // Privileged persistence only after verifying membership and the exact submission.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: claimed, error: claimError } = await supabaseAdmin.from("diary_submissions").update({ ai_status: "processing" }).eq("id", submission.id).eq("ai_status", "not_requested").select("id").maybeSingle();
    if (claimError) throw new Error("Não foi possível iniciar as dicas do diário.");
    if (!claimed) return { approved: submission.status === "approved" };
    const entries = z.array(z.object({ entry_date: z.string(), content: z.string(), kind: z.string() })).parse(submission.entries_snapshot);
    const valid = diaryDatesValid(entries, diaryToday(new Date(submission.submitted_at)));
    let feedback: string | null = null;
    if (valid) {
      try {
        const { diaryAdvice } = await import("./diary-auto.server");
        feedback = await diaryAdvice(entries);
      } catch {
        console.warn("Diary AI advice unavailable; dated diary remains automatically approved.");
      }
    }
    const { error: saveError } = await supabaseAdmin.from("diary_submissions").update({
      ...diaryAutoResult(valid, feedback), approval_source: "automatic", reviewed_at: new Date().toISOString(), reviewed_by: null,
      teacher_note: valid ? "Diário aprovado automaticamente: todos os registros possuem datas válidas." : "Confiram as datas dos registros: cada registro precisa de uma data válida, não futura.",
    }).eq("id", submission.id).eq("ai_status", "processing");
    if (saveError) throw new Error("Diário enviado, mas não foi possível salvar as dicas da IA.");
    return { approved: valid };
  });