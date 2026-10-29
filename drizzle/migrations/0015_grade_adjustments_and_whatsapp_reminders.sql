-- Per-student grade adjustment set by the teacher (added to the group grade after the late penalty).
CREATE TABLE public.student_grade_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bimester INTEGER NOT NULL CHECK (bimester BETWEEN 1 AND 4),
  points NUMERIC NOT NULL CHECK (points BETWEEN -10 AND 10),
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, student_id, bimester)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_grade_adjustments TO authenticated;
GRANT ALL ON public.student_grade_adjustments TO service_role;
ALTER TABLE public.student_grade_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teacher manages own class adjustments" ON public.student_grade_adjustments
  FOR ALL TO authenticated
  USING (public.teaches_group(group_id))
  WITH CHECK (
    public.teaches_group(group_id)
    AND EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = student_grade_adjustments.group_id AND gm.student_id = student_grade_adjustments.student_id)
  );
CREATE POLICY "Student reads own adjustments" ON public.student_grade_adjustments
  FOR SELECT TO authenticated
  USING (student_id = auth.uid());

-- WhatsApp reminder settings, one row per teacher.
CREATE TABLE public.whatsapp_settings (
  teacher_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  auto_enabled BOOLEAN NOT NULL DEFAULT false,
  interval_days INTEGER NOT NULL DEFAULT 3 CHECK (interval_days BETWEEN 1 AND 30),
  last_auto_run_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.whatsapp_settings TO authenticated;
GRANT ALL ON public.whatsapp_settings TO service_role;
ALTER TABLE public.whatsapp_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teacher manages own whatsapp settings" ON public.whatsapp_settings
  FOR ALL TO authenticated
  USING (public.is_teacher() AND teacher_id = auth.uid())
  WITH CHECK (public.is_teacher() AND teacher_id = auth.uid());

-- Outbound reminder messages (written only by the server).
CREATE TABLE public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
  student_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  student_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL,
  phase_number INTEGER NOT NULL,
  due_date TIMESTAMPTZ,
  days_left INTEGER,
  trigger TEXT NOT NULL CHECK (trigger IN ('manual', 'auto')),
  wa_message_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'accepted' CHECK (status IN ('accepted', 'sent', 'delivered', 'read', 'failed')),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ
);
CREATE INDEX whatsapp_messages_teacher_idx ON public.whatsapp_messages (teacher_id, created_at DESC);
GRANT SELECT ON public.whatsapp_messages TO authenticated;
GRANT ALL ON public.whatsapp_messages TO service_role;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teacher reads own whatsapp messages" ON public.whatsapp_messages
  FOR SELECT TO authenticated
  USING (public.is_teacher() AND teacher_id = auth.uid());

-- Verified webhook deliveries from WhatsApp (server only).
CREATE TABLE public.whatsapp_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id TEXT NOT NULL UNIQUE,
  event TEXT NOT NULL,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  processing_error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ
);
CREATE INDEX whatsapp_webhook_events_pending_idx ON public.whatsapp_webhook_events (last_attempt_at NULLS FIRST) WHERE processed_at IS NULL;
GRANT ALL ON public.whatsapp_webhook_events TO service_role;
ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;

-- Applies one delivery status to an outbound message. Never moves backwards
-- (sent cannot overwrite delivered/read; failed only replaces accepted/sent) and keeps the first
-- provider timestamp of each status. Returns false when no outbound message has that id yet.
CREATE OR REPLACE FUNCTION public.apply_whatsapp_status(_wa_id TEXT, _status TEXT, _at TIMESTAMPTZ, _error TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cur TEXT;
  _rank_cur INT;
  _rank_new INT;
BEGIN
  SELECT status INTO _cur FROM public.whatsapp_messages WHERE wa_message_id = _wa_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  _rank_cur := CASE _cur WHEN 'accepted' THEN 0 WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2 WHEN 'read' THEN 3 ELSE 1 END;
  _rank_new := CASE _status WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2 WHEN 'read' THEN 3 WHEN 'failed' THEN 2 ELSE -1 END;
  UPDATE public.whatsapp_messages SET
    sent_at = CASE WHEN _status = 'sent' THEN COALESCE(sent_at, _at) ELSE sent_at END,
    delivered_at = CASE WHEN _status = 'delivered' THEN COALESCE(delivered_at, _at) ELSE delivered_at END,
    read_at = CASE WHEN _status = 'read' THEN COALESCE(read_at, _at) ELSE read_at END,
    failed_at = CASE WHEN _status = 'failed' THEN COALESCE(failed_at, _at) ELSE failed_at END,
    error = CASE WHEN _status = 'failed' THEN COALESCE(_error, error) ELSE error END,
    status = CASE
      WHEN _status = 'failed' AND _cur IN ('accepted', 'sent') THEN 'failed'
      WHEN _status <> 'failed' AND _cur <> 'failed' AND _rank_new > _rank_cur THEN _status
      ELSE status END
  WHERE wa_message_id = _wa_id;
  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.apply_whatsapp_status(TEXT, TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_whatsapp_status(TEXT, TEXT, TIMESTAMPTZ, TEXT) TO service_role;