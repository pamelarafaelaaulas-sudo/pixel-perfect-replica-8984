import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateEvaluation } from "./ai-feedback.server";
import { phaseMeta } from "./phases";

export const getPhaseEvaluation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        projectId: z.string().uuid(),
        phaseNumber: z.number().int().min(1).max(4),
        text: z.string().min(20).max(30000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // Only members of the project's group may request (and save) an AI evaluation.
    const { data: project, error } = await context.supabase
      .from("projects")
      .select("id, group_id")
      .eq("id", data.projectId)
      .maybeSingle();
    if (error || !project) throw new Error("Projeto não encontrado.");
    const { data: isMember } = await context.supabase.rpc("is_group_member", { _group_id: project.group_id });
    if (!isMember) throw new Error("Só integrantes do grupo podem pedir sugestões.");

    const evaluation = await generateEvaluation(phaseMeta(data.phaseNumber).name, data.text);

    // Students cannot insert evaluations directly (no insert policy), so scores can't be forged.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: saved, error: saveError } = await supabaseAdmin
      .from("ai_evaluations")
      .insert({
        project_id: project.id,
        group_id: project.group_id,
        phase_number: data.phaseNumber,
        requested_by: context.userId,
        overall: evaluation.overall,
        criteria: evaluation.criteria,
        summary: evaluation.summary,
        tips: evaluation.tips,
        evaluated_text: data.text,
      })
      .select("created_at")
      .single();
    if (saveError) console.error("Failed to save AI evaluation", saveError);

    // Scores stay with the teacher; the student screen reloads the score-free suggestions.
    return { savedAt: saved?.created_at ?? null };
  });
