-- Lowercase, accent-free, letters/digits only (mirror of normalizeText in src/lib/citations.ts).
CREATE OR REPLACE FUNCTION public.fold_text(_t TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT btrim(regexp_replace(lower(translate(coalesce(_t, ''),
    'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
    'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn')), '[^a-z0-9]+', ' ', 'g'))
$$;

-- True when no reference line has the year and at least one author word.
-- Uses every word of the author part (a superset of what the app uses), so it is never stricter than the app.
CREATE OR REPLACE FUNCTION public.reference_is_missing(_authors TEXT, _year TEXT, _lines TEXT[])
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  WITH w AS (
    SELECT x FROM unnest(string_to_array(public.fold_text(_authors), ' ')) x
    WHERE length(x) >= 2 AND x <> ALL (ARRAY['de','da','do','das','dos','del','van','von','e','et','al'])
  )
  SELECT coalesce(_authors, '') ~ '[A-ZÀ-ÖØ-Þ]'
     AND EXISTS (SELECT 1 FROM w)
     AND NOT EXISTS (
       SELECT 1 FROM unnest(_lines) l, w
       WHERE l ~ ('(^|[^0-9])' || _year || '([^0-9]|$)') AND position(' ' || w.x || ' ' IN l) > 0
     )
$$;

-- First work cited in _cited with no matching line in _refs, written as in the text; NULL when all are listed.
CREATE OR REPLACE FUNCTION public.first_missing_reference(_cited TEXT, _refs TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  _lines TEXT[];
  _m TEXT[];
  _w TEXT[];
BEGIN
  SELECT coalesce(array_agg(' ' || public.fold_text(l) || ' '), '{}') INTO _lines
    FROM unnest(regexp_split_to_array(coalesce(_refs, ''), '\n')) l WHERE btrim(l) <> '';
  -- (Silva, 2020)  (Silva; Souza, 2021, p. 4)  (Silva, 2020; Souza, 2021)
  FOR _m IN SELECT regexp_matches(coalesce(_cited, ''), '\(([^()]*)\)', 'g') LOOP
    FOR _w IN SELECT regexp_matches(_m[1], '([^,]*),\s*([0-9]{4})', 'g') LOOP
      IF public.reference_is_missing(_w[1], _w[2], _lines) THEN RETURN '(' || _m[1] || ')'; END IF;
    END LOOP;
  END LOOP;
  -- Silva (2020)  Silva e Souza (2021, p. 3)  Pellis et al. (2018)
  FOR _m IN SELECT regexp_matches(coalesce(_cited, ''),
      '((?:[A-ZÀ-ÖØ-Þ][^[:space:]()]*[[:space:]]+(?:(?:de|da|do|das|dos|del|van|von|e)[[:space:]]+)?)+(?:et al\.[[:space:]]+)?)\(([0-9]{4})', 'g') LOOP
    IF public.reference_is_missing(_m[1], _m[2], _lines) THEN RETURN btrim(_m[1]) || ' (' || _m[2] || ')'; END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

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
    ELSE NULL;
  END CASE;
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.phase_rule_problem(public.projects, INT) FROM PUBLIC, anon, authenticated;