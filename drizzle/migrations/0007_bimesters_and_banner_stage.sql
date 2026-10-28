-- The school year now has 4 bimestres. Grade and peer-evaluation rows keep the "trimester" column name,
-- which now holds the bimestre number (1–4).
ALTER TABLE public.grades DROP CONSTRAINT IF EXISTS grades_trimester_check;
ALTER TABLE public.grades ADD CONSTRAINT grades_trimester_check CHECK (trimester BETWEEN 1 AND 4);
ALTER TABLE public.peer_evaluations DROP CONSTRAINT IF EXISTS peer_evaluations_trimester_check;
ALTER TABLE public.peer_evaluations ADD CONSTRAINT peer_evaluations_trimester_check CHECK (trimester BETWEEN 1 AND 4);
COMMENT ON COLUMN public.grades.trimester IS 'Bimestre (1–4). Name kept from when the year had trimesters.';
COMMENT ON COLUMN public.peer_evaluations.trimester IS 'Bimestre (1–4). Name kept from when the year had trimesters.';

-- Stage 13: the banner, built in Canva from the teacher's template.
ALTER TABLE public.schedules DROP CONSTRAINT IF EXISTS schedules_phase_number_check;
ALTER TABLE public.schedules ADD CONSTRAINT schedules_phase_number_check CHECK (phase_number BETWEEN 1 AND 13);
ALTER TABLE public.phase_submissions DROP CONSTRAINT IF EXISTS phase_submissions_phase_number_check;
ALTER TABLE public.phase_submissions ADD CONSTRAINT phase_submissions_phase_number_check CHECK (phase_number BETWEEN 1 AND 13);
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_current_phase_check;
ALTER TABLE public.projects ADD CONSTRAINT projects_current_phase_check CHECK (current_phase BETWEEN 1 AND 13);

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS banner_canva_url TEXT,
  ADD COLUMN IF NOT EXISTS banner_file_path TEXT,
  ADD COLUMN IF NOT EXISTS banner_file_name TEXT;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS banner_template_url TEXT;

-- Backfill: every existing class gets a banner deadline 3 weeks after the Resumo.
INSERT INTO public.schedules (class_id, phase_number, phase_name, due_date)
SELECT s.class_id, 13, 'Banner', s.due_date + interval '21 days'
FROM public.schedules s WHERE s.phase_number = 12
ON CONFLICT (class_id, phase_number) DO NOTHING;

-- Projects that already delivered the Resumo move on to the banner.
SELECT set_config('app.phase_advance', 'on', true);
UPDATE public.projects p SET current_phase = 13
WHERE p.current_phase = 12 AND EXISTS (SELECT 1 FROM public.phase_submissions ps WHERE ps.project_id = p.id AND ps.phase_number = 12);
SELECT set_config('app.phase_advance', 'off', true);

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
    (NEW.id, 12, 'Resumo', _base + interval '105 days'),
    (NEW.id, 13, 'Banner', _base + interval '126 days');
  RETURN NEW;
END;
$$;

-- Banner files live in the private "banners" bucket under "<group_id>/<file>".
CREATE OR REPLACE FUNCTION public.banner_group(_name TEXT)
RETURNS UUID LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN split_part(coalesce(_name, ''), '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN split_part(_name, '/', 1)::uuid END
$$;

-- Members can change the banner file only until the banner is delivered.
CREATE OR REPLACE FUNCTION public.can_edit_banner(_group_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_group_member(_group_id) AND NOT EXISTS (
    SELECT 1 FROM public.projects p JOIN public.phase_submissions s ON s.project_id = p.id
    WHERE p.group_id = _group_id AND s.phase_number = 13
  )
$$;
GRANT EXECUTE ON FUNCTION public.banner_group(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_banner(UUID) TO authenticated;

CREATE POLICY "Group members upload banner" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'banners' AND public.can_edit_banner(public.banner_group(name)));
CREATE POLICY "Group members replace banner" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'banners' AND public.can_edit_banner(public.banner_group(name)))
  WITH CHECK (bucket_id = 'banners' AND public.can_edit_banner(public.banner_group(name)));
CREATE POLICY "Group members remove banner" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'banners' AND public.can_edit_banner(public.banner_group(name)));
CREATE POLICY "Group and teacher read banner" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'banners' AND (public.is_group_member(public.banner_group(name)) OR public.teaches_group(public.banner_group(name))));

CREATE OR REPLACE FUNCTION public.phase_rule_problem(_p public.projects, _phase INT)
RETURNS TEXT LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  _w INT;
  _n INT;
  _missing TEXT;
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
      IF NOT public.has_author_date_citation(_p.introduction) THEN RETURN 'A introdução precisa de pelo menos uma citação nas normas ABNT, como (Silva, 2020).'; END IF;
    WHEN 9 THEN
      _w := public.word_count(_p.results_discussion);
      IF _w < 250 OR _w > 750 THEN RETURN 'Resultados e discussão devem ter de 250 a 750 palavras.'; END IF;
      IF NOT public.has_author_date_citation(_p.results_discussion) THEN RETURN 'Resultados e discussão precisam de pelo menos uma citação nas normas ABNT, como (Silva, 2020).'; END IF;
    WHEN 10 THEN
      _w := public.word_count(_p.conclusion);
      IF _w = 0 OR _w > 150 THEN RETURN 'A conclusão deve ter até 150 palavras.'; END IF;
    WHEN 11 THEN
      IF public.word_count(_p.references_list) = 0 THEN RETURN 'Liste as referências antes de entregar.'; END IF;
      _missing := public.first_missing_reference(_p.introduction, _p.references_list);
      IF _missing IS NOT NULL THEN RETURN 'Falta nas Referências: ' || _missing || ', citado na Introdução.'; END IF;
      _missing := public.first_missing_reference(_p.results_discussion, _p.references_list);
      IF _missing IS NOT NULL THEN RETURN 'Falta nas Referências: ' || _missing || ', citado em Resultados e discussão.'; END IF;
    WHEN 12 THEN
      _w := public.word_count(_p.abstract);
      SELECT count(*) INTO _n FROM unnest(string_to_array(coalesce(_p.keywords, ''), ';')) k WHERE btrim(k) <> '';
      IF _w < 150 OR _w > 250 THEN RETURN 'O resumo deve ter de 150 a 250 palavras.'; END IF;
      IF _n < 3 OR _n > 5 THEN RETURN 'Use de 3 a 5 palavras-chave separadas por ponto e vírgula.'; END IF;
    WHEN 13 THEN
      IF coalesce(btrim(_p.banner_canva_url), '') !~* '^https://([a-z0-9-]+\.)*(canva\.com|canva\.link)/' THEN
        RETURN 'Cole o link do banner no Canva (começa com https://www.canva.com/).';
      END IF;
      IF public.banner_group(_p.banner_file_path) IS DISTINCT FROM _p.group_id
         OR NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'banners' AND o.name = _p.banner_file_path) THEN
        RETURN 'Anexe o arquivo final do banner (PDF ou imagem).';
      END IF;
    ELSE NULL;
  END CASE;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.phase_rule_problem(public.projects, INT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_phase(_project_id UUID)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _proj public.projects;
  _problem TEXT;
  _last CONSTANT INT := 13; -- keep equal to the number of stages in src/lib/phases.ts
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
  IF _proj.current_phase < _last THEN
    PERFORM set_config('app.phase_advance', 'on', true);
    UPDATE public.projects SET current_phase = _proj.current_phase + 1 WHERE id = _project_id;
    PERFORM set_config('app.phase_advance', 'off', true);
  END IF;
  RETURN _proj.current_phase;
END;
$$;