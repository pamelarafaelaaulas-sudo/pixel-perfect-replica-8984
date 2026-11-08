import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** One idea in the Banco de Inspirações (rows in `idea_bank`, per teacher). */
export type Idea = {
  id: string;
  area: string; // AREAS code
  theme: string;
  question: string;
  summary: string;
  bncc: string[];
};

/** RLS returns the teacher's own ideas, or for students the ideas of their class's teacher. */
export const ideaBankQuery = queryOptions({
  queryKey: ["idea-bank"],
  queryFn: async (): Promise<Idea[]> => {
    const { data, error } = await supabase
      .from("idea_bank")
      .select("id, area, theme, question, summary, bncc")
      .order("area")
      .order("theme");
    if (error) throw error;
    return data ?? [];
  },
});

/** Groups already using each idea: idea id → list of "Grupo (Turma)". */
export const ideaUsageQuery = queryOptions({
  queryKey: ["idea-usage"],
  queryFn: async (): Promise<Record<string, string[]>> => {
    const { data, error } = await supabase.rpc("idea_usage");
    if (error) throw error;
    const map: Record<string, string[]> = {};
    for (const r of data ?? []) (map[r.idea_id] ??= []).push(`${r.group_name} (${r.class_name})`);
    return map;
  },
});
