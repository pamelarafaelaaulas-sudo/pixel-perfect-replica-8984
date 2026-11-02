-- Bloco 3: video trail (Diário de Bordo video at the start, references/highlights video at the end) and the Diário de Bordo.
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS diary_video_url TEXT,
  ADD COLUMN IF NOT EXISTS references_video_url TEXT,
  ADD COLUMN IF NOT EXISTS highlighted_article_url TEXT,
  ADD COLUMN IF NOT EXISTS diary_review_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS diary_review_end TIMESTAMPTZ;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS diary_video_watched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS diary_video_watched_by UUID;

-- New classes inherit the teacher's latest trail links and diary review period.
CREATE OR REPLACE FUNCTION public.inherit_class_trail()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  _prev RECORD;
BEGIN
  SELECT diary_video_url, references_video_url, highlighted_article_url, diary_review_start, diary_review_end
  INTO _prev FROM public.classes
  WHERE teacher_id = NEW.teacher_id
    AND (diary_video_url IS NOT NULL OR references_video_url IS NOT NULL OR highlighted_article_url IS NOT NULL OR diary_review_start IS NOT NULL)
  ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    NEW.diary_video_url := coalesce(NEW.diary_video_url, _prev.diary_video_url);
    NEW.references_video_url := coalesce(NEW.references_video_url, _prev.references_video_url);
    NEW.highlighted_article_url := coalesce(NEW.highlighted_article_url, _prev.highlighted_article_url);
    NEW.diary_review_start := coalesce(NEW.diary_review_start, _prev.diary_review_start);
    NEW.diary_review_end := coalesce(NEW.diary_review_end, _prev.diary_review_end);
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.inherit_class_trail() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER classes_inherit_trail BEFORE INSERT ON public.classes
  FOR EACH ROW EXECUTE FUNCTION public.inherit_class_trail();

-- Diário de Bordo: dated, append-only entries written by each student of the group.
CREATE TABLE public.diary_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Campo_Grande')::date),
  kind TEXT NOT NULL DEFAULT 'registro' CHECK (kind IN ('registro', 'acerto', 'erro', 'mudanca')),
  content TEXT NOT NULL CHECK (char_length(btrim(content)) BETWEEN 3 AND 5000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX diary_entries_group_idx ON public.diary_entries (group_id, entry_date, created_at);
CREATE INDEX diary_entries_student_idx ON public.diary_entries (student_id, entry_date);

GRANT SELECT, INSERT ON public.diary_entries TO authenticated;
GRANT ALL ON public.diary_entries TO service_role;
ALTER TABLE public.diary_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members write own diary entries" ON public.diary_entries
  FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid() AND public.is_group_member(group_id));
CREATE POLICY "Members read group diary" ON public.diary_entries
  FOR SELECT TO authenticated USING (public.is_group_member(group_id));
CREATE POLICY "Teacher reads group diary" ON public.diary_entries
  FOR SELECT TO authenticated USING (public.teaches_group(group_id));

-- Entries are dated honestly: never in the future, at most 7 days back, and the creation time is always the server's.
CREATE OR REPLACE FUNCTION public.guard_diary_entry()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE
  _today DATE := (now() AT TIME ZONE 'America/Campo_Grande')::date;
BEGIN
  NEW.created_at := now();
  NEW.content := btrim(NEW.content);
  IF NEW.entry_date > _today THEN
    RAISE EXCEPTION 'A data do registro não pode ser no futuro.';
  END IF;
  IF NEW.entry_date < _today - 7 THEN
    RAISE EXCEPTION 'Registre no máximo com 7 dias de atraso. O diário precisa ser contínuo.';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER diary_entries_guard BEFORE INSERT ON public.diary_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_diary_entry();
REVOKE ALL ON FUNCTION public.guard_diary_entry() FROM PUBLIC, anon, authenticated;

-- Teacher's 3rd-bimestre grade (0–10) and feedback for each student's diary; the student reads their own.
CREATE TABLE public.diary_grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  score NUMERIC NOT NULL CHECK (score >= 0 AND score <= 10),
  feedback TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, student_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.diary_grades TO authenticated;
GRANT ALL ON public.diary_grades TO service_role;
ALTER TABLE public.diary_grades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teacher manages diary grades" ON public.diary_grades
  FOR ALL TO authenticated
  USING (public.teaches_group(group_id))
  WITH CHECK (public.teaches_group(group_id));
CREATE POLICY "Student reads own diary grade" ON public.diary_grades
  FOR SELECT TO authenticated USING (student_id = auth.uid());

CREATE OR REPLACE FUNCTION public.touch_diary_grade()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
CREATE TRIGGER diary_grades_touch BEFORE INSERT OR UPDATE ON public.diary_grades
  FOR EACH ROW EXECUTE FUNCTION public.touch_diary_grade();
REVOKE ALL ON FUNCTION public.touch_diary_grade() FROM PUBLIC, anon, authenticated;

-- Stage 1 (Tema): when the teacher set the Diário de Bordo video, the group must confirm it watched it.
CREATE OR REPLACE FUNCTION public.phase_rule_problem(_p projects, _phase integer)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  _problem TEXT;
  _template TEXT;
  _form TEXT;
  _video TEXT;
BEGIN
  _problem := public.phase_rule_problem_base(_p, _phase);
  IF _problem IS NOT NULL OR _phase NOT IN (1, 7, 13) THEN RETURN _problem; END IF;
  SELECT c.banner_template_url, c.ethics_form_template_url, c.diary_video_url INTO _template, _form, _video
  FROM public.groups g JOIN public.classes c ON c.id = g.class_id
  WHERE g.id = _p.group_id;
  IF _phase = 1 THEN
    IF coalesce(btrim(_video), '') <> '' AND _p.diary_video_watched_at IS NULL THEN
      RETURN 'Assistam ao vídeo do Diário de Bordo e marquem que assistiram antes de entregar.';
    END IF;
  ELSIF _phase = 13 THEN
    IF public.canva_design_id(_p.banner_canva_url) IS NOT NULL
       AND lower(public.canva_design_id(_p.banner_canva_url)) = lower(public.canva_design_id(_template)) THEN
      RETURN 'Esse é o link do modelo da professora. Use o modelo no Canva e cole o link da cópia do grupo.';
    END IF;
  ELSIF _p.ethics_human_research AND 'online' = ANY(_p.ethics_collection)
     AND _form IS NOT NULL
     AND rtrim(lower(btrim(_p.ethics_form_url)), '/') = rtrim(lower(btrim(_form)), '/') THEN
    RETURN 'Esse é o link do modelo da professora. Faça uma cópia do formulário e cole o link do formulário do grupo.';
  END IF;
  RETURN NULL;
END;
$function$;