import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateWrittenComparison } from "./written-review.server";
import { phaseMeta } from "./phases";

/**
 * AI comparison of the reviewed text and the group's new version for one written-stage feedback round,
 * with an improvement grade. The group triggers it right after resubmitting and the teacher can redo it;
 * only the teacher reads the result.
 */
export const compareWrittenVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ reviewId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: review, error } = await sb.from("written_reviews").select("*").eq("id", data.reviewId).maybeSingle();
    if (error || !review) throw new Error("Devolutiva não encontrada.");
    const [{ data: isMember }, { data: isTeacher }] = await Promise.all([
      sb.rpc("is_group_member", { _group_id: review.group_id }),
      sb.rpc("teaches_group", { _group_id: review.group_id }),
    ]);
    if (!isMember && !isTeacher) throw new Error("Só o grupo e a professora podem pedir a comparação.");
    if (!review.resubmitted_at || review.resubmitted_text === null) throw new Error("O grupo ainda não enviou a nova versão.");

    const meta = phaseMeta(review.phase_number);
    const cmp = await generateWrittenComparison({
      stageName: meta.name,
      stageGuide: meta.hint,
      before: review.reviewed_text,
      after: review.resubmitted_text,
      teacherNotes: review.notes ?? "",
      studentResponse: review.student_response ?? "",
      round: review.round,
    });

    // Caller verified as member/teacher above; students have no write (or read) access to comparisons.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: saveError } = await supabaseAdmin.from("written_comparisons").upsert(
      {
        review_id: review.id,
        group_id: review.group_id,
        project_id: review.project_id,
        phase_number: review.phase_number,
        requested_by: context.userId,
        created_at: new Date().toISOString(),
        ...cmp,
      },
      { onConflict: "review_id" },
    );
    if (saveError) {
      console.error("Failed to save written comparison", saveError);
      throw new Error("A comparação foi feita, mas não foi salva. Tente de novo.");
    }
    return { ok: true };
  });
