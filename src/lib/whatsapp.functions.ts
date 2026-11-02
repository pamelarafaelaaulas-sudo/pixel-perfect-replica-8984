import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CUSTOM_MAX_CHARS, cleanCustomText } from "./reminders";

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

const OFFLINE = {
  connected: false,
  displayPhone: null as string | null,
  verifiedName: null as string | null,
  templateStatus: "UNKNOWN",
  rejectedReason: null as string | null,
  customTemplateStatus: "UNKNOWN",
  customRejectedReason: null as string | null,
};

/** Connection state, template approval and who would get a reminder right now. */
export const getReminderOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = await requireTeacher(context);
    const { isWhatsappOwner, whatsappStatus, previewReminders, previewRecipients } = await import("./whatsapp.server");
    const allowed = isWhatsappOwner(email);
    const status = allowed
      ? await whatsappStatus().catch((e: Error) => {
          console.error(e);
          return OFFLINE;
        })
      : OFFLINE;
    const preview = await previewReminders(context.supabase, context.userId, status.displayPhone);
    const custom = await previewRecipients(context.supabase, context.userId, status.displayPhone);
    return { allowed, ...status, ...preview, recipients: custom.recipients, recipientsSkipped: custom.skipped };
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

/** Sends the teacher's own text to the chosen students of her classes. */
export const sendCustomWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        studentIds: z.array(z.string().uuid()).min(1, "Escolha pelo menos um aluno.").max(500),
        text: z
          .string()
          .refine((t) => cleanCustomText(t).length > 0, "Escreva a mensagem.")
          .refine((t) => cleanCustomText(t).length <= CUSTOM_MAX_CHARS, `No máximo ${CUSTOM_MAX_CHARS} caracteres.`),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const email = await requireTeacher(context);
    const { isWhatsappOwner, sendCustomMessage } = await import("./whatsapp.server");
    if (!isWhatsappOwner(email)) throw new Error("Este WhatsApp está ligado à conta de outra professora.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return sendCustomMessage(supabaseAdmin, context.userId, data.studentIds, data.text);
  });
