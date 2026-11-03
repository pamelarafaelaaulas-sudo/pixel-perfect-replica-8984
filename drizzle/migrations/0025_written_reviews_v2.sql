-- Text of one written stage (4–12), used as the snapshot of each version.
CREATE OR REPLACE FUNCTION public.written_phase_text(_p public.projects, _phase INT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _phase
    WHEN 4 THEN concat_ws(E'\n', 'Título: ' || coalesce(_p.title, ''), 'Instituição: ' || coalesce(_p.institution, ''), 'Área: ' || coalesce(_p.area_subarea, ''))
    WHEN 5 THEN coalesce(_p.general_objective, '')
    WHEN 6 THEN coalesce(_p.specific_objectives, '')
    WHEN 7 THEN coalesce(_p.methodology, '')
    WHEN 8 THEN coalesce(_p.introduction, '')
    WHEN 9 THEN coalesce(_p.results_discussion, '')
    WHEN 10 THEN coalesce(_p.conclusion, '')
    WHEN 11 THEN coalesce(_p.references_list, '')
    WHEN 12 THEN concat_ws(E'\n\n', coalesce(_p.abstract, ''), 'Palavras-chave: ' || coalesce(_p.keywords, ''))
    ELSE ''
  END
$$;
REVOKE EXECUTE ON FUNCTION public.written_phase_text(public.projects, INT) FROM PUBLIC, anon, authenticated;

-- Same text for comparison: trimmed, any run of spaces/line breaks counts as one space.
CREATE OR REPLACE FUNCTION public.normalized_text(_t TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT regexp_replace(btrim(coalesce(_t, '')), '\s+', ' ', 'g')
$$;

-- One row per teacher feedback round on a delivered written stage; the group answers with a new version.
CREATE TABLE public.written_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  phase_number INTEGER NOT NULL CHECK (phase_number BETWEEN 4 AND 12),
  round INTEGER NOT NULL DEFAULT 1,
  teacher_id UUID,
  notes TEXT NOT NULL DEFAULT '',
  reviewed_text TEXT NOT NULL DEFAULT '',
  resubmit_due_at TIMESTAMPTZ NOT NULL,
  resubmitted_at TIMESTAMPTZ,
  resubmitted_text TEXT,
  resubmitted_by UUID,
  student_response TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX written_reviews_one_open_per_stage ON public.written_reviews (project_id, phase_number) WHERE resubmitted_at IS NULL;
CREATE INDEX written_reviews_group_idx ON public.written_reviews (group_id, phase_number, round);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.written_reviews TO authenticated;
GRANT ALL ON public.written_reviews TO service_role;
ALTER TABLE public.written_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teacher manages own group written reviews" ON public.written_reviews
  FOR ALL TO authenticated
  USING (public.teaches_group(group_id))
  WITH CHECK (public.teaches_group(group_id));
CREATE POLICY "Members read own group written reviews" ON public.written_reviews
  FOR SELECT TO authenticated
  USING (public.is_group_member(group_id));

-- New round: only on a delivered stage; numbered automatically and tied to the text being reviewed.
CREATE OR REPLACE FUNCTION public.prepare_written_review()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _p public.projects;
BEGIN
  SELECT * INTO _p FROM public.projects WHERE id = NEW.project_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Projeto não encontrado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.phase_submissions s WHERE s.project_id = _p.id AND s.phase_number = NEW.phase_number) THEN
    RAISE EXCEPTION 'O grupo ainda não entregou esta etapa';
  END IF;
  NEW.group_id := _p.group_id;
  NEW.teacher_id := auth.uid();
  NEW.reviewed_text := public.written_phase_text(_p, NEW.phase_number);
  NEW.resubmitted_at := NULL;
  NEW.resubmitted_text := NULL;
  NEW.resubmitted_by := NULL;
  NEW.student_response := NULL;
  SELECT coalesce(max(r.round), 0) + 1 INTO NEW.round
    FROM public.written_reviews r WHERE r.project_id = NEW.project_id AND r.phase_number = NEW.phase_number;
  RETURN NEW;
END;
$$;
CREATE TRIGGER written_reviews_prepare BEFORE INSERT ON public.written_reviews
  FOR EACH ROW EXECUTE FUNCTION public.prepare_written_review();

CREATE OR REPLACE FUNCTION public.touch_written_review()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  NEW.round := OLD.round;
  NEW.project_id := OLD.project_id;
  NEW.group_id := OLD.group_id;
  NEW.phase_number := OLD.phase_number;
  NEW.reviewed_text := OLD.reviewed_text;
  IF current_setting('app.written_resubmit', true) IS DISTINCT FROM 'on' THEN
    NEW.resubmitted_at := OLD.resubmitted_at;
    NEW.resubmitted_text := OLD.resubmitted_text;
    NEW.resubmitted_by := OLD.resubmitted_by;
    NEW.student_response := OLD.student_response;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER written_reviews_touch BEFORE UPDATE ON public.written_reviews
  FOR EACH ROW EXECUTE FUNCTION public.touch_written_review();
REVOKE ALL ON FUNCTION public.prepare_written_review() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_written_review() FROM PUBLIC, anon, authenticated;

-- The group answers the open round with the text saved on the project: written answer required,
-- identical text refused, and the stage's delivery rules (word limits, citations…) still apply.
CREATE OR REPLACE FUNCTION public.resubmit_written(_review_id UUID, _response TEXT)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _r public.written_reviews;
  _p public.projects;
  _text TEXT;
  _problem TEXT;
  _now TIMESTAMPTZ := now();
BEGIN
  SELECT * INTO _r FROM public.written_reviews WHERE id = _review_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_group_member(_r.group_id) THEN
    RAISE EXCEPTION 'Devolutiva não encontrada';
  END IF;
  IF _r.resubmitted_at IS NOT NULL THEN
    RAISE EXCEPTION 'A nova versão já foi enviada para esta devolutiva';
  END IF;
  IF length(btrim(coalesce(_response, ''))) < 20 THEN
    RAISE EXCEPTION 'Escreva o que vocês mudaram nesta versão (pelo menos 20 caracteres).';
  END IF;
  SELECT * INTO _p FROM public.projects WHERE id = _r.project_id;
  _text := public.written_phase_text(_p, _r.phase_number);
  IF public.normalized_text(_text) = public.normalized_text(_r.reviewed_text) THEN
    RAISE EXCEPTION 'O texto está idêntico à versão anterior. Faça as correções pedidas antes de reenviar.';
  END IF;
  _problem := public.phase_rule_problem(_p, _r.phase_number);
  IF _problem IS NOT NULL THEN RAISE EXCEPTION '%', _problem; END IF;
  PERFORM set_config('app.written_resubmit', 'on', true);
  UPDATE public.written_reviews
    SET resubmitted_at = _now, resubmitted_text = _text, resubmitted_by = auth.uid(), student_response = btrim(_response)
    WHERE id = _review_id;
  PERFORM set_config('app.written_resubmit', 'off', true);
  RETURN _now;
END;
$$;
REVOKE ALL ON FUNCTION public.resubmit_written(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resubmit_written(UUID, TEXT) TO authenticated;

-- AI comparison of version N and N+1 of a written stage, with an improvement grade. Teacher-only; written by the server.
CREATE TABLE public.written_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL UNIQUE REFERENCES public.written_reviews(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  phase_number INTEGER NOT NULL,
  change_percent INTEGER NOT NULL DEFAULT 0,
  improvement_score NUMERIC NOT NULL DEFAULT 0,
  summary TEXT NOT NULL DEFAULT '',
  changed JSONB NOT NULL DEFAULT '[]'::jsonb,
  addressed JSONB NOT NULL DEFAULT '[]'::jsonb,
  pending JSONB NOT NULL DEFAULT '[]'::jsonb,
  response_matches BOOLEAN,
  response_note TEXT NOT NULL DEFAULT '',
  requested_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX written_comparisons_group_idx ON public.written_comparisons (group_id);

GRANT SELECT ON public.written_comparisons TO authenticated;
GRANT ALL ON public.written_comparisons TO service_role;
ALTER TABLE public.written_comparisons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teacher reads own group written comparisons" ON public.written_comparisons
  FOR SELECT TO authenticated
  USING (public.teaches_group(group_id));