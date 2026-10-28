import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateFeedback } from "./ai-feedback.server";

export const getPhaseFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ phaseName: z.string().min(1).max(100), text: z.string().min(20).max(30000) }).parse(d),
  )
  .handler(async ({ data }) => ({ feedback: await generateFeedback(data.phaseName, data.text) }));
