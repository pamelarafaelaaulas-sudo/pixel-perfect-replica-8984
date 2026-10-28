-- The written project is split into 9 parts, each its own stage with a deadline (stages 4..12).
ALTER TABLE public.schedules DROP CONSTRAINT IF EXISTS schedules_phase_number_check;
ALTER TABLE public.schedules ADD CONSTRAINT schedules_phase_number_check CHECK (phase_number BETWEEN 1 AND 12);
ALTER TABLE public.phase_submissions DROP CONSTRAINT IF EXISTS phase_submissions_phase_number_check;
ALTER TABLE public.phase_submissions ADD CONSTRAINT phase_submissions_phase_number_check CHECK (phase_number BETWEEN 1 AND 12);
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_current_phase_check;
ALTER TABLE public.projects ADD CONSTRAINT projects_current_phase_check CHECK (current_phase BETWEEN 1 AND 12);
ALTER TABLE public.ai_evaluations DROP CONSTRAINT IF EXISTS ai_evaluations_phase_number_check;
ALTER TABLE public.ai_evaluations ADD CONSTRAINT ai_evaluations_phase_number_check CHECK (phase_number BETWEEN 1 AND 12);

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS institution TEXT,
  ADD COLUMN IF NOT EXISTS area_subarea TEXT,
  ADD COLUMN IF NOT EXISTS conclusion TEXT,
  ADD COLUMN IF NOT EXISTS abstract TEXT,
  ADD COLUMN IF NOT EXISTS keywords TEXT;

-- Backfill: existing classes keep stage 4's date for "Título" and get weekly deadlines for the other parts.
UPDATE public.schedules SET phase_name = 'Título' WHERE phase_number = 4;
INSERT INTO public.schedules (class_id, phase_number, phase_name, due_date)
SELECT s.class_id, n.num, n.name, s.due_date + ((n.num - 4) * interval '7 days')
FROM public.schedules s
CROSS JOIN (VALUES
  (5, 'Objetivo geral'), (6, 'Objetivos específicos'), (7, 'Metodologia'), (8, 'Introdução'),
  (9, 'Resultados e discussão'), (10, 'Conclusão'), (11, 'Referências'), (12, 'Resumo')
) AS n(num, name)
WHERE s.phase_number = 4
ON CONFLICT (class_id, phase_number) DO NOTHING;

-- Projects that had already delivered the whole written project move on to the next part.
UPDATE public.projects p SET current_phase = 5
WHERE p.current_phase = 4 AND EXISTS (SELECT 1 FROM public.phase_submissions ps WHERE ps.project_id = p.id AND ps.phase_number = 4);

CREATE OR REPLACE FUNCTION public.create_default_schedules()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _base TIMESTAMPTZ := date_trunc('day', now()) + interval '23 hours 59 minutes';
BEGIN
  INSERT INTO public.schedules (class_id, phase_number, phase_name, due_date) VALUES
    (NEW.id, 1, 'Tema', _base + interval '14 days'),
    (NEW.id, 2, 'Artigos científicos', _base + interval '28 days'),
    (NEW.id, 3, 'Pergunta norteadora', _base + interval '42 days'),
    (NEW.id, 4, 'Título', _base + interval '49 days'),
    (NEW.id, 5, 'Objetivo geral', _base + interval '56 days'),
    (NEW.id, 6, 'Objetivos específicos', _base + interval '63 days'),
    (NEW.id, 7, 'Metodologia', _base + interval '70 days'),
    (NEW.id, 8, 'Introdução', _base + interval '77 days'),
    (NEW.id, 9, 'Resultados e discussão', _base + interval '84 days'),
    (NEW.id, 10, 'Conclusão', _base + interval '91 days'),
    (NEW.id, 11, 'Referências', _base + interval '98 days'),
    (NEW.id, 12, 'Resumo', _base + interval '105 days');
  RETURN NEW;
END;
$$;

-- Word count used by the delivery rules (mirrors countWords in src/lib/phase-rules.ts)
CREATE OR REPLACE FUNCTION public.word_count(_t TEXT)
RETURNS INT LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN regexp_replace(coalesce(_t, ''), '^\s+|\s+$', '', 'g') = '' THEN 0
    ELSE array_length(regexp_split_to_array(regexp_replace(_t, '^\s+|\s+$', '', 'g'), '\s+'), 1) END
$$;

-- Returns the first rule the stage breaks, or NULL when it can be delivered.
CREATE OR REPLACE FUNCTION public.phase_rule_problem(_p public.projects, _phase INT)
RETURNS TEXT LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  _w INT;
  _n INT;
BEGIN
  CASE _phase
    WHEN 1 THEN IF public.word_count(_p.theme) = 0 THEN RETURN 'Escreva o tema antes de entregar.'; END IF;
    WHEN 2 THEN IF jsonb_array_length(coalesce(_p.scientific_articles, '[]'::jsonb)) = 0 THEN RETURN 'Adicione pelo menos um artigo antes de entregar.'; END IF;
    WHEN 3 THEN IF public.word_count(_p.guiding_question) = 0 THEN RETURN 'Escreva a pergunta norteadora antes de entregar.'; END IF;
    WHEN 4 THEN IF public.word_count(_p.title) = 0 THEN RETURN 'Escreva o título antes de entregar.'; END IF;
    WHEN 5 THEN
      _w := public.word_count(_p.general_objective);
      IF _w = 0 OR _w > 50 THEN RETURN 'O objetivo geral deve ter até 50 palavras.'; END IF;
    WHEN 6 THEN
      _w := public.word_count(_p.specific_objectives);
      SELECT count(*) INTO _n FROM unnest(regexp_split_to_array(coalesce(_p.specific_objectives, ''), '\n')) x WHERE btrim(x) <> '';
      IF _w = 0 OR _w > 100 THEN RETURN 'Os objetivos específicos devem ter até 100 palavras.'; END IF;
      IF _n > 5 THEN RETURN 'Escreva no máximo 5 objetivos específicos, um por linha.'; END IF;
    WHEN 7 THEN
      _w := public.word_count(_p.methodology);
      IF _w < 250 OR _w > 750 THEN RETURN 'A metodologia deve ter de 250 a 750 palavras.'; END IF;
    WHEN 8 THEN
      _w := public.word_count(_p.introduction);
      IF _w < 250 OR _w > 500 THEN RETURN 'A introdução deve ter de 250 a 500 palavras.'; END IF;
    WHEN 9 THEN
      _w := public.word_count(_p.results_discussion);
      IF _w < 250 OR _w > 750 THEN RETURN 'Resultados e discussão devem ter de 250 a 750 palavras.'; END IF;
    WHEN 10 THEN
      _w := public.word_count(_p.conclusion);
      IF _w = 0 OR _w > 150 THEN RETURN 'A conclusão deve ter até 150 palavras.'; END IF;
    WHEN 11 THEN IF public.word_count(_p.references_list) = 0 THEN RETURN 'Liste as referências antes de entregar.'; END IF;
    WHEN 12 THEN
      _w := public.word_count(_p.abstract);
      SELECT count(*) INTO _n FROM unnest(string_to_array(coalesce(_p.keywords, ''), ';')) k WHERE btrim(k) <> '';
      IF _w < 150 OR _w > 250 THEN RETURN 'O resumo deve ter de 150 a 250 palavras.'; END IF;
      IF _n < 3 OR _n > 5 THEN RETURN 'Use de 3 a 5 palavras-chave separadas por ponto e vírgula.'; END IF;
    ELSE NULL;
  END CASE;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_phase(_project_id UUID)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _proj public.projects;
  _problem TEXT;
BEGIN
  SELECT * INTO _proj FROM public.projects WHERE id = _project_id FOR UPDATE;
  IF _proj.id IS NULL OR NOT public.is_group_member(_proj.group_id) THEN
    RAISE EXCEPTION 'Você não faz parte deste grupo';
  END IF;
  IF EXISTS (SELECT 1 FROM public.phase_submissions WHERE project_id = _project_id AND phase_number = _proj.current_phase) THEN
    RAISE EXCEPTION 'Esta etapa já foi entregue';
  END IF;
  _problem := public.phase_rule_problem(_proj, _proj.current_phase);
  IF _problem IS NOT NULL THEN RAISE EXCEPTION '%', _problem; END IF;
  INSERT INTO public.phase_submissions (project_id, phase_number, submitted_by) VALUES (_project_id, _proj.current_phase, auth.uid());
  IF _proj.current_phase < 12 THEN
    PERFORM set_config('app.phase_advance', 'on', true);
    UPDATE public.projects SET current_phase = _proj.current_phase + 1 WHERE id = _project_id;
    PERFORM set_config('app.phase_advance', 'off', true);
  END IF;
  RETURN _proj.current_phase;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.phase_rule_problem(public.projects, INT) FROM PUBLIC, anon, authenticated;
