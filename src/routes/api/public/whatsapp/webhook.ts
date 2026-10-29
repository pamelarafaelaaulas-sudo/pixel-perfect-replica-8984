import { createFileRoute } from "@tanstack/react-router";
import { verifyWebhookRequest } from "@lovable.dev/webhooks-js";

/** Receives WhatsApp callbacks (delivery statuses, incoming messages) forwarded by Lovable. */
export const Route = createFileRoute("/api/public/whatsapp/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["WHATSAPP_API_KEY"];
        if (!secret) return new Response("Server configuration error", { status: 500 });

        let payload: unknown;
        try {
          const verified = await verifyWebhookRequest({ req: request, secret, maxBodyBytes: 4 * 1024 * 1024 });
          payload = verified.payload;
        } catch {
          return new Response("Unauthorized", { status: 401 });
        }

        const deliveryId = request.headers.get("x-lovable-delivery")?.trim();
        const event = request.headers.get("x-lovable-event")?.trim();
        if (!deliveryId || !event) return new Response("Missing delivery headers", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { processStoredEvent, processPendingEvents } = await import("@/lib/whatsapp.server");

        const ins = await supabaseAdmin
          .from("whatsapp_webhook_events")
          .upsert(
            { delivery_id: deliveryId, event, payload: payload as never },
            { onConflict: "delivery_id", ignoreDuplicates: true },
          );
        if (ins.error) {
          console.error(`WhatsApp webhook insert failed: ${ins.error.message}`);
          return new Response("Storage error", { status: 500 });
        }
        const { data: row, error } = await supabaseAdmin
          .from("whatsapp_webhook_events")
          .select("id, event, payload, received_at, attempts, processed_at")
          .eq("delivery_id", deliveryId)
          .single();
        if (error || !row) {
          console.error(`WhatsApp webhook read failed: ${error?.message}`);
          return new Response("Storage error", { status: 500 });
        }
        if (!row.processed_at) {
          const ok = await processStoredEvent(supabaseAdmin, row);
          if (!ok) return new Response("Processing error", { status: 500 });
        }
        // Bounded recovery of older unfinished deliveries.
        await processPendingEvents(supabaseAdmin, 5);
        return new Response("ok");
      },
    },
  },
});
