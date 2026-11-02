-- Bloco 2: external fairs choice and ethics screening (human research / TCLE) in the Metodologia stage.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS external_fairs_interest BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS external_fairs TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS ethics_human_research BOOLEAN,
  ADD COLUMN IF NOT EXISTS ethics_collection TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS ethics_form_url TEXT;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_external_fairs_check CHECK (external_fairs <@ ARRAY['FETEC/MS', 'FECINTEC']::text[]),
  ADD CONSTRAINT projects_ethics_collection_check CHECK (ethics_collection <@ ARRAY['online', 'presencial']::text[]);

COMMENT ON COLUMN public.projects.ethics_human_research IS 'NULL = not answered yet; true = research involves people (forms, interviews, usability tests, images).';

-- The teacher's Google Forms model (with header and TCLE) that groups copy for online collection.
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS ethics_form_template_url TEXT;

-- New classes inherit the teacher's latest Forms model, like the fair date.
CREATE OR REPLACE FUNCTION public.inherit_class_ethics_form()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.ethics_form_template_url IS NULL THEN
    SELECT ethics_form_template_url INTO NEW.ethics_form_template_url FROM public.classes
    WHERE teacher_id = NEW.teacher_id AND ethics_form_template_url IS NOT NULL
    ORDER BY created_at DESC LIMIT 1;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.inherit_class_ethics_form() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER classes_inherit_ethics_form BEFORE INSERT ON public.classes
  FOR EACH ROW EXECUTE FUNCTION public.inherit_class_ethics_form();

-- A Google Forms link: docs.google.com/forms/..., forms.gle/... or forms.google.com/...
CREATE OR REPLACE FUNCTION public.is_google_form_url(_url TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT coalesce(btrim(_url), '') ~* '^https://(docs\.google\.com/forms/|forms\.gle/|forms\.google\.com/)'
$$;
GRANT EXECUTE ON FUNCTION public.is_google_form_url(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.phase_rule_problem_base(_p projects, _phase integer)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  _w INT;
  _n INT;
  _missing TEXT;
BEGIN
  CASE _phase
    WHEN 1 THEN IF public.word_count(_p.theme) = 0 THEN RETURN 'Escreva o tema antes de entregar.'; END IF;
    WHEN 2 THEN IF jsonb_array_length(coalesce(_p.scientific_articles, '[]'::jsonb)) = 0 THEN RETURN 'Adicione pelo menos um artigo antes de entregar.'; END IF;
    WHEN 3 THEN IF public.word_count(_p.guiding_question) = 0 THEN RETURN 'Escreva a pergunta norteadora antes de entregar.'; END IF;
      IF public.word_count(_p.social_application) = 0 THEN RETURN 'Escreva a aplicação ou intervenção social antes de entregar.'; END IF;
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
      IF _p.ethics_human_research IS NULL THEN
        RETURN 'Responda se a pesquisa envolve seres humanos (triagem ética).';
      END IF;
      IF _p.ethics_human_research THEN
        IF coalesce(array_length(_p.ethics_collection, 1), 0) = 0 THEN
          RETURN 'Escolha como os dados serão coletados: online (Google Forms) ou presencial.';
        END IF;
        IF 'online' = ANY(_p.ethics_collection) AND NOT public.is_google_form_url(_p.ethics_form_url) THEN
          RETURN 'Cole o link do Google Forms que o grupo vai aplicar na pesquisa.';
        END IF;
      END IF;
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
$function$;

-- Wrapper checks that need the class: own Canva copy (banner) and own Google Forms (not the teacher's model).
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
BEGIN
  _problem := public.phase_rule_problem_base(_p, _phase);
  IF _problem IS NOT NULL OR _phase NOT IN (7, 13) THEN RETURN _problem; END IF;
  SELECT c.banner_template_url, c.ethics_form_template_url INTO _template, _form
  FROM public.groups g JOIN public.classes c ON c.id = g.class_id
  WHERE g.id = _p.group_id;
  IF _phase = 13 THEN
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