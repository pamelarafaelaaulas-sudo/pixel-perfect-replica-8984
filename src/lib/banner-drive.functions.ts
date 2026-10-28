import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DriveUnavailable, driveAccountEmail, ensureClassFolder, folderUrl, syncProjectBanner } from "./banner-drive.server";

/** Called after a group uploads its banner file: copies it to the teacher's Drive folder. */
export const syncBannerToDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ groupId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [{ data: member }, { data: teacher }] = await Promise.all([
      context.supabase.rpc("is_group_member", { _group_id: data.groupId }),
      context.supabase.rpc("teaches_group", { _group_id: data.groupId }),
    ]);
    if (!member && !teacher) throw new Error("Sem acesso a este grupo.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: project } = await supabaseAdmin.from("projects").select("id").eq("group_id", data.groupId).maybeSingle();
    if (!project) return { status: "no_file" as const };
    try {
      const r = await syncProjectBanner(supabaseAdmin, project.id, await driveAccountEmail());
      return { status: r.status };
    } catch (e) {
      if (e instanceof DriveUnavailable) return { status: "not_owner" as const };
      throw e;
    }
  });

/** Teacher: is the Drive folder available for this class, and where is it. */
export const classDriveFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ classId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: teaches } = await context.supabase.rpc("teaches_class", { _class_id: data.classId });
    if (!teaches) throw new Error("Sem acesso a esta turma.");
    const { data: cls } = await context.supabase.from("classes").select("name, teacher_id").eq("id", data.classId).single();
    const { data: me } = await context.supabase.from("profiles").select("email").eq("id", context.userId).single();
    if (!cls || !me) throw new Error("Turma não encontrada.");
    try {
      const owner = await driveAccountEmail();
      if (!owner || owner !== me.email.trim().toLowerCase()) return { available: false as const, folderUrl: null };
      return { available: true as const, folderUrl: folderUrl(await ensureClassFolder(data.classId, cls.name)) };
    } catch (e) {
      if (e instanceof DriveUnavailable) return { available: false as const, folderUrl: null };
      throw e;
    }
  });

/** Teacher: copy every group's current banner file in the class to the Drive. */
export const syncClassBanners = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ classId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: teaches } = await context.supabase.rpc("teaches_class", { _class_id: data.classId });
    if (!teaches) throw new Error("Sem acesso a esta turma.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: projects } = await supabaseAdmin
      .from("projects")
      .select("id, groups!projects_group_id_fkey!inner(class_id)")
      .eq("groups.class_id", data.classId)
      .not("banner_file_path", "is", null);
    const owner = await driveAccountEmail();
    let synced = 0;
    let unchanged = 0;
    let notOwner = 0;
    for (const p of projects ?? []) {
      const r = await syncProjectBanner(supabaseAdmin, p.id, owner);
      if (r.status === "synced") synced++;
      else if (r.status === "unchanged") unchanged++;
      else if (r.status === "not_owner") notOwner++;
    }
    return { synced, unchanged, notOwner, total: projects?.length ?? 0 };
  });
