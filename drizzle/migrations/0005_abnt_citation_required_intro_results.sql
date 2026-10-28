-- Looser mirror of src/lib/citations.ts: anything the app accepts also passes here.
CREATE OR REPLACE FUNCTION public.has_author_date_citation(_t TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT coalesce(_t, '') ~ '\([^()]*[[:alpha:]][^()]*,\s*[0-9]{4}[a-z]?[^()]*\)'
      OR coalesce(_t, '') ~ '[[:alpha:].]\s+\([0-9]{4}[a-z]?[^()]*\)'
$$;

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
      IF NOT public.has_author_date_citation(_p.introduction) THEN RETURN 'A introdução precisa de pelo menos uma citação nas normas ABNT, como (Silva, 2020).'; END IF;
    WHEN 9 THEN
      _w := public.word_count(_p.results_discussion);
      IF _w < 250 OR _w > 750 THEN RETURN 'Resultados e discussão devem ter de 250 a 750 palavras.'; END IF;
      IF NOT public.has_author_date_citation(_p.results_discussion) THEN RETURN 'Resultados e discussão precisam de pelo menos uma citação nas normas ABNT, como (Silva, 2020).'; END IF;
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

REVOKE EXECUTE ON FUNCTION public.phase_rule_problem(public.projects, INT) FROM PUBLIC, anon, authenticated;
