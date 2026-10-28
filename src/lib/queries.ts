import { queryOptions } from "@tanstack/react-query";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { parseSavedEvaluation } from "@/lib/ai-score";

export type Role = "teacher" | "student";

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async () => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    // A network hiccup is not a sign-out: throw so the cached account is kept
    // instead of being replaced by null (which blanked every signed-in screen).
    if (!user && userError && isAuthRetryableFetchError(userError)) throw userError;
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
            projects(id, current_phase, updated_at, area_code, project_seq, phase_submissions(phase_number, submitted_at)),
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
          classes!groups_class_id_fkey(id, name, class_code, code_label, late_penalty_per_day, banner_template_url, banner_size, banner_sections, banner_instructions, schedules(*)),
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
            classes!groups_class_id_fkey(id, name, class_code, code_label),
            group_members(id),
            projects(id, current_phase, updated_at, area_code, project_seq)
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

/* ---------------- AI evaluations ---------------- */

export const aiEvaluationsForGroupQuery = (groupId: string) =>
  queryOptions({
    queryKey: ["ai", "group", groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_evaluations")
        .select(
          "id, phase_number, requested_by, created_at, overall, criteria, summary, tips, evaluated_text",
        )
        .eq("group_id", groupId)
        .order("created_at", { ascending: false });
      fail(error);
      return (data ?? []).map(parseSavedEvaluation);
    },
  });

/** Student view: AI suggestions only — scores are never sent to students. */
export const aiSuggestionsForGroupQuery = (groupId: string) =>
  queryOptions({
    queryKey: ["ai", "group", groupId, "suggestions"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("group_ai_suggestions", { _group_id: groupId });
      fail(error);
      return (data ?? []).map((r) => parseSavedEvaluation({ ...r, overall: 0, evaluated_text: "" }));
    },
  });

/* ---------------- Teacher: per-student review ---------------- */

async function fetchStudentReview(studentId: string) {
  const [profileRes, membershipsRes, peersRes] = await Promise.all([
    supabase.from("profiles").select("id, name, email, whatsapp").eq("id", studentId).maybeSingle(),
    supabase
      .from("group_members")
      .select(
        `id, whatsapp, joined_at,
            groups(id, group_name,
              classes!groups_class_id_fkey(id, name, late_penalty_per_day, schedules(phase_number, due_date)),
              group_members(student_id),
              projects(id, current_phase, phase_submissions(phase_number, submitted_at), project_contributions(student_id, char_count_added)),
              grades(trimester, score, feedback, is_reference_ten, created_at)
            )`,
      )
      .eq("student_id", studentId)
      .order("joined_at", { ascending: false }),
    supabase
      .from("peer_evaluations")
      .select("group_id, trimester, score")
      .eq("evaluated_student_id", studentId),
  ]);
  fail(profileRes.error);
  fail(membershipsRes.error);
  fail(peersRes.error);
  const groupIds = (membershipsRes.data ?? [])
    .map((m) => m.groups?.id)
    .filter((x): x is string => !!x);
  let ai: (ReturnType<typeof parseSavedEvaluation> & { groupId: string })[] = [];
  if (groupIds.length) {
    const aiRes = await supabase
      .from("ai_evaluations")
      .select(
        "id, group_id, phase_number, requested_by, created_at, overall, criteria, summary, tips, evaluated_text",
      )
      .in("group_id", groupIds);
    fail(aiRes.error);
    ai = (aiRes.data ?? []).map((r) => ({ ...parseSavedEvaluation(r), groupId: r.group_id }));
  }
  return {
    profile: profileRes.data,
    memberships: membershipsRes.data ?? [],
    peers: peersRes.data ?? [],
    aiEvaluations: ai,
  };
}

export type StudentReview = Awaited<ReturnType<typeof fetchStudentReview>>;

export const studentReviewQuery = (studentId: string) =>
  queryOptions({
    queryKey: ["teacher", "student", studentId],
    queryFn: () => fetchStudentReview(studentId),
  });

/* ---------------- Teacher: invites for other teachers ---------------- */

export const teacherInvitesQuery = queryOptions({
  queryKey: ["teacher", "invites"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("teacher_invites")
      .select("id, code, used_by_name, used_at, created_at")
      .order("created_at", { ascending: false });
    fail(error);
    return data ?? [];
  },
});

/* ---------------- Teacher: all students across classes ---------------- */

export const teacherRosterQuery = queryOptions({
  queryKey: ["teacher", "roster"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("classes")
      .select(
        `id, name, late_penalty_per_day,
        schedules(phase_number, due_date),
        groups!groups_class_id_fkey(
          id, group_name,
          group_members(student_id, profiles(name, email)),
          projects(current_phase, phase_submissions(phase_number, submitted_at))
        )`,
      )
      .order("created_at", { ascending: false });
    fail(error);
    return data ?? [];
  },
});

/* ---------------- Teacher: bimestre grades across classes ---------------- */

export const teacherBimesterQuery = queryOptions({
  queryKey: ["teacher", "bimester"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("classes")
      .select(
        `id, name, late_penalty_per_day,
        schedules(phase_number, due_date),
        groups!groups_class_id_fkey(
          id, group_name,
          group_members(profiles(name)),
          projects(current_phase, phase_submissions(phase_number, submitted_at)),
          grades(trimester, score, feedback, is_reference_ten)
        )`,
      )
      .order("created_at", { ascending: false });
    fail(error);
    return data ?? [];
  },
});

/* ---------------- Teacher: grades and feedback export ---------------- */

export const teacherExportQuery = queryOptions({
  queryKey: ["teacher", "export"],
  queryFn: async () => {
    const [classes, ai, peers] = await Promise.all([
      supabase
        .from("classes")
        .select(
          `id, name, code_label, late_penalty_per_day,
          schedules(phase_number, due_date),
          groups!groups_class_id_fkey(
            id, group_name,
            group_members(student_id, profiles(name)),
            projects(current_phase, area_code, project_seq, phase_submissions(phase_number, submitted_at)),
            grades(trimester, score, feedback, is_reference_ten, created_at)
          )`,
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("ai_evaluations")
        .select("id, group_id, phase_number, requested_by, created_at, overall, criteria, summary, tips, evaluated_text"),
      supabase
        .from("peer_evaluations")
        .select("group_id, trimester, evaluator_student_id, evaluated_student_id, score, feedback, created_at"),
    ]);
    fail(classes.error);
    fail(ai.error);
    fail(peers.error);
    return { classes: classes.data ?? [], ai: ai.data ?? [], peers: peers.data ?? [] };
  },
});

/* ---------------- Teacher: each group's banner ---------------- */

export const classBannersQuery = (classId: string) =>
  queryOptions({
    queryKey: ["teacher", "banners", classId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("groups")
        .select(
          `id, group_name,
          projects(
            id, area_code, project_seq, banner_canva_url, banner_file_path, banner_file_name,
            phase_submissions(phase_number, submitted_at),
            project_contributions(section_name, edited_at, profiles(name)),
            banner_drive_files(drive_file_id, synced_at)
          )`,
        )
        .eq("class_id", classId)
        .order("created_at", { ascending: true });
      fail(error);
      return data ?? [];
    },
  });
