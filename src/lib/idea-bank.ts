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

export type IdeaUse = { groupId: string; classId: string; label: string };
/** Groups already using each idea (idea id → uses). */
export const ideaUsageQuery = queryOptions({
  queryKey: ["idea-usage"],
  queryFn: async (): Promise<Record<string, IdeaUse[]>> => {
    const { data, error } = await supabase.rpc("idea_usage");
    if (error) throw error;
    const map: Record<string, IdeaUse[]> = {};
    for (const r of data ?? [])
      (map[r.idea_id] ??= []).push({ groupId: r.group_id, classId: r.class_id, label: `${r.group_name} (${r.class_name})` });
    return map;
  },
});

/** An idea is blocked for a group when another group of the same class already uses it. */
export function ideaTakenBy(uses: IdeaUse[] | undefined, groupId: string, classId: string): IdeaUse | undefined {
  return uses?.find((u) => u.classId === classId && u.groupId !== groupId);
}
