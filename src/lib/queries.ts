import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Role = "teacher" | "student";

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const [profileRes, rolesRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", user.id),
    ]);
    fail(profileRes.error);
    fail(rolesRes.error);
    const role: Role = rolesRes.data?.some((r) => r.role === "teacher") ? "teacher" : "student";
    return {
      id: user.id,
      email: user.email ?? "",
      name: profileRes.data?.name ?? user.email ?? "",
      whatsapp: profileRes.data?.whatsapp ?? "",
      role,
    };
  },
  staleTime: 60_000,
});

/* ---------------- Teacher ---------------- */

export const teacherClassesQuery = queryOptions({
  queryKey: ["teacher", "classes"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("classes")
      .select("*, groups!groups_class_id_fkey(id, group_members(id))")
      .order("created_at", { ascending: false });
    fail(error);
    return data ?? [];
  },
});

export const classDetailQuery = (classId: string) =>
  queryOptions({
    queryKey: ["class", classId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select(
          `*,
          schedules(*),
          groups!groups_class_id_fkey(
            id, group_name, created_at,
            group_members(id, student_id, whatsapp, profiles(name)),
            projects(id, current_phase, updated_at, phase_submissions(phase_number, submitted_at)),
            grades(trimester, score)
          )`,
        )
        .eq("id", classId)
        .maybeSingle();
      fail(error);
      return data;
    },
  });

export const groupDetailQuery = (groupId: string) =>
  queryOptions({
    queryKey: ["group", groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("groups")
        .select(
          `*,
          classes!groups_class_id_fkey(id, name, class_code, late_penalty_per_day, schedules(*)),
          group_members(id, student_id, whatsapp, profiles(name, email)),
          projects(*, phase_submissions(*), project_contributions(*)),
          grades(*)`,
        )
        .eq("id", groupId)
        .maybeSingle();
      fail(error);
      return data;
    },
  });

export const peerEvaluationsForGroupQuery = (groupId: string) =>
  queryOptions({
    queryKey: ["peer", "group", groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("peer_evaluations")
        .select("*")
        .eq("group_id", groupId)
        .order("trimester");
      fail(error);
      return data ?? [];
    },
  });

/* ---------------- Student ---------------- */

export const myGroupsQuery = (userId: string) =>
  queryOptions({
    queryKey: ["student", "groups", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("group_members")
        .select(
          `id, group_id,
          groups(id, group_name,
            classes!groups_class_id_fkey(id, name, class_code),
            group_members(id),
            projects(id, current_phase, updated_at)
          )`,
        )
        .eq("student_id", userId)
        .order("joined_at", { ascending: false });
      fail(error);
      return data ?? [];
    },
  });

export const myPeerEvaluationsQuery = (groupId: string, userId: string) =>
  queryOptions({
    queryKey: ["peer", "mine", groupId, userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("peer_evaluations")
        .select("*")
        .eq("group_id", groupId)
        .eq("evaluator_student_id", userId);
      fail(error);
      return data ?? [];
    },
  });
