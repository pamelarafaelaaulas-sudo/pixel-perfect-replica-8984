ALTER TABLE public.diary_submissions ADD COLUMN approval_source text NOT NULL DEFAULT 'teacher' CHECK (approval_source IN ('teacher','automatic'));
ALTER TABLE public.diary_submissions ADD COLUMN ai_status text NOT NULL DEFAULT 'not_requested' CHECK (ai_status IN ('not_requested','processing','complete','unavailable'));
ALTER TABLE public.diary_submissions ADD COLUMN ai_feedback text;
CREATE FUNCTION public.auto_approve_diary_submission() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE e jsonb; d date; valid_dates boolean := true;
BEGIN
 IF jsonb_typeof(NEW.entries_snapshot) <> 'array' OR jsonb_array_length(NEW.entries_snapshot)=0 THEN valid_dates := false;
 ELSE
  FOR e IN SELECT value FROM jsonb_array_elements(NEW.entries_snapshot) LOOP
   BEGIN
    IF coalesce(e->>'entry_date','') !~ '^\d{4}-\d{2}-\d{2}$' THEN valid_dates := false; EXIT; END IF;
    d := (e->>'entry_date')::date;
    IF d > (NEW.submitted_at AT TIME ZONE 'America/Campo_Grande')::date THEN valid_dates := false; EXIT; END IF;
   EXCEPTION WHEN OTHERS THEN valid_dates := false; EXIT;
   END;
  END LOOP;
 END IF;
 NEW.approval_source := 'automatic';
 NEW.status := CASE WHEN valid_dates THEN 'approved' ELSE 'changes_requested' END;
 NEW.reviewed_at := now();
 NEW.reviewed_by := NULL;
 NEW.teacher_note := CASE WHEN valid_dates THEN 'Diário aprovado automaticamente: todos os registros possuem datas válidas.' ELSE 'Confiram as datas dos registros: cada registro precisa de uma data válida, não futura. Acrescentem um registro com a data correta e reenviem.' END;
 RETURN NEW;
END; $$;
CREATE TRIGGER diary_automatic_approval BEFORE INSERT ON public.diary_submissions FOR EACH ROW EXECUTE FUNCTION public.auto_approve_diary_submission();
REVOKE ALL ON FUNCTION public.auto_approve_diary_submission() FROM PUBLIC;