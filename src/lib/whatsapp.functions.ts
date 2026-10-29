import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireTeacher(context: { supabase: any; userId: string }) {
  const { data: isTeacher, error } = await context.supabase.rpc("is_teacher");
  if (error) throw new Error(error.message);
  if (!isTeacher) throw new Error("Apenas professoras podem usar os lembretes.");
  const { data: profile } = await context.supabase
    .from("profiles")
    .select("email")
    .eq("id", context.userId)
    .maybeSingle();
  return (profile?.email as string | undefined) ?? null;
}

/** Connection state, template approval and who would get a reminder right now. */
export const getReminderOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = await requireTeacher(context);
    const { isWhatsappOwner, whatsappStatus, previewReminders } = await import("./whatsapp.server");
    const allowed = isWhatsappOwner(email);
    const status = allowed
      ? await whatsappStatus().catch((e: Error) => {
          console.error(e);
          return { connected: false, displayPhone: null, verifiedName: null, templateStatus: "UNKNOWN", rejectedReason: null };
        })
      : { connected: false, displayPhone: null, verifiedName: null, templateStatus: "UNKNOWN", rejectedReason: null };
    const preview = await previewReminders(context.supabase, context.userId, status.displayPhone);
    return { allowed, ...status, ...preview };
  });

/** Sends the reminder now to everyone listed in the overview. */
export const sendRemindersNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = await requireTeacher(context);
    const { isWhatsappOwner, sendReminders } = await import("./whatsapp.server");
    if (!isWhatsappOwner(email)) throw new Error("Este WhatsApp está ligado à conta de outra professora.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return sendReminders(supabaseAdmin, context.userId, "manual");
  });
