ALTER TABLE public.whatsapp_messages
  ADD COLUMN kind TEXT NOT NULL DEFAULT 'reminder' CHECK (kind IN ('reminder', 'custom')),
  ADD COLUMN body TEXT;
COMMENT ON COLUMN public.whatsapp_messages.body IS 'Teacher-written text of a custom message (kind = custom)';