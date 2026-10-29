import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Daily check: sends the stage-deadline reminders for teachers whose automatic interval has elapsed. */
export const Route = createFileRoute("/api/public/jobs/whatsapp-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { isWhatsappOwner, sendReminders, processPendingEvents } = await import("@/lib/whatsapp.server");
        const { autoRunDue } = await import("@/lib/reminders");

        const now = new Date();
        const { data: settings, error } = await supabaseAdmin
          .from("whatsapp_settings")
          .select("teacher_id, interval_days, last_auto_run_at, profiles!whatsapp_settings_teacher_id_fkey(email)")
          .eq("auto_enabled", true);
        if (error) {
          console.error(`Could not load reminder settings: ${error.message}`);
          return new Response("Storage error", { status: 500 });
        }
        const results: { teacherId: string; sent: number; failed: number; templateStatus: string }[] = [];
        for (const s of settings ?? []) {
          if (!isWhatsappOwner(s.profiles?.email)) continue;
          if (!autoRunDue(s.last_auto_run_at, s.interval_days, now)) continue;
          try {
            const r = await sendReminders(supabaseAdmin, s.teacher_id, "auto", now);
            if (r.templateStatus === "APPROVED") {
              await supabaseAdmin
                .from("whatsapp_settings")
                .update({ last_auto_run_at: now.toISOString() })
                .eq("teacher_id", s.teacher_id);
            }
            results.push({ teacherId: s.teacher_id, sent: r.sent, failed: r.failed, templateStatus: r.templateStatus });
          } catch (e) {
            console.error(`Automatic reminders failed: ${(e as Error).message}`);
          }
        }
        await processPendingEvents(supabaseAdmin, 25);
        return Response.json({ ok: true, runs: results.length });
      },
    },
  },
});
