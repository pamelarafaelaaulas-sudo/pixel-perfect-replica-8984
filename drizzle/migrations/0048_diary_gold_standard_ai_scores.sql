CREATE TABLE public.diary_gold_standards (
 teacher_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
 submission_id uuid NOT NULL REFERENCES public.diary_submissions(id) ON DELETE CASCADE,
 entries_snapshot jsonb NOT NULL,
 selected_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, DELETE ON public.diary_gold_standards TO authenticated;
GRANT ALL ON public.diary_gold_standards TO service_role;
ALTER TABLE public.diary_gold_standards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teacher reads own gold diary" ON public.diary_gold_standards FOR SELECT TO authenticated USING (teacher_id=auth.uid() AND public.teaches_group(group_id));
CREATE POLICY "Teacher removes own gold diary" ON public.diary_gold_standards FOR DELETE TO authenticated USING (teacher_id=auth.uid() AND public.teaches_group(group_id));
CREATE TABLE public.diary_ai_evaluations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 submission_id uuid NOT NULL UNIQUE REFERENCES public.diary_submissions(id) ON DELETE CASCADE,
 group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
 reference_submission_id uuid REFERENCES public.diary_submissions(id) ON DELETE SET NULL,
 score numeric CHECK (score BETWEEN 0 AND 10),
 axes jsonb NOT NULL,
 comparison text NOT NULL,
 validated boolean NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.diary_ai_evaluations TO authenticated;
GRANT ALL ON public.diary_ai_evaluations TO service_role;
ALTER TABLE public.diary_ai_evaluations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owning teacher reads diary AI scores" ON public.diary_ai_evaluations FOR SELECT TO authenticated USING (public.teaches_group(group_id));
CREATE OR REPLACE FUNCTION public.set_diary_gold_standard(_submission_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.diary_submissions;
BEGIN
 SELECT * INTO s FROM public.diary_submissions WHERE id=_submission_id;
 IF s.id IS NULL OR NOT public.teaches_group(s.group_id) THEN RAISE EXCEPTION 'Somente a professora responsável pode eleger este diário.'; END IF;
 IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(s.entries_snapshot) e WHERE coalesce(e->>'photo_path','') <> '') THEN RAISE EXCEPTION 'O diário de referência precisa conter fotos.'; END IF;
 INSERT INTO public.diary_gold_standards(teacher_id,group_id,submission_id,entries_snapshot) VALUES(auth.uid(),s.group_id,s.id,s.entries_snapshot)
 ON CONFLICT(teacher_id) DO UPDATE SET group_id=excluded.group_id,submission_id=excluded.submission_id,entries_snapshot=excluded.entries_snapshot,selected_at=now();
END; $$;
REVOKE ALL ON FUNCTION public.set_diary_gold_standard(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_diary_gold_standard(uuid) TO authenticated;
ALTER TABLE public.diary_submissions ADD COLUMN photo_validation text NOT NULL DEFAULT 'not_checked' CHECK (photo_validation IN ('not_checked','validated','changes_requested','unavailable'));
COMMENT ON COLUMN public.diary_submissions.photo_validation IS 'Visual AI validation independent of date-only automatic approval; no AI scores exposed here.';