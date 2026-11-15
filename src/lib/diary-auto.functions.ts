import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
    const group = await context.supabase.from("groups").select("classes(teacher_id)").eq("id", data.groupId).single();
    const teacherId = group.data?.classes?.teacher_id;
    if (group.error || !teacherId) throw new Error("Professora do grupo não encontrada.");
    const { evaluateDiaryPhotos } = await import("./diary-evaluation.server");
    const result = await evaluateDiaryPhotos(submission.id, data.groupId, teacherId);
    return { approved: result.validated };
  });