import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const assessDiary = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(input => z.object({ groupId: z.string().uuid(), submissionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const teacher = await context.supabase.rpc("teaches_group", { _group_id: data.groupId });
    const member = await context.supabase.rpc("is_group_member", { _group_id: data.groupId });
    if (teacher.error || member.error || (!teacher.data && !member.data)) throw new Error("Você não tem acesso a este diário.");
    const group = await context.supabase.from("groups").select("classes(teacher_id)").eq("id", data.groupId).single();
    const teacherId = group.data?.classes?.teacher_id;
    if (group.error || !teacherId) throw new Error("Professora do grupo não encontrada.");
    const { evaluateDiaryPhotos } = await import("./diary-evaluation.server");
    return evaluateDiaryPhotos(data.submissionId, data.groupId, teacherId);
  });