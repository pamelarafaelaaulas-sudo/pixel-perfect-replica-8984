CREATE OR REPLACE FUNCTION public.article_problem(_p public.projects)
RETURNS text LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $f$
DECLARE _a jsonb; _i int := 0; _t text; _au text; _y text; _yn int; _name text;
  _u text; _d text; _tk text; _us text[] := '{}'; _ds text[] := '{}'; _ts text[] := '{}'; _j int;
BEGIN
  FOR _a IN SELECT * FROM jsonb_array_elements(coalesce(_p.scientific_articles, '[]'::jsonb)) LOOP
    _i := _i + 1;
    _t := btrim(coalesce(_a->>'title', ''));
    IF length(_t) < 15 OR array_length(regexp_split_to_array(_t, '\s+'), 1) < 3 THEN
      RETURN format('Fonte %s: escreva o título completo do estudo.', _i); END IF;
    IF lower(_t) ~ '(.)\1{3,}' OR lower(replace(_t, ' ', '')) ~ '(qwert|asdfg|zxcvb|12345)' THEN
      RETURN format('Fonte %s: o título parece inventado.', _i); END IF;
    IF coalesce(_a->>'url', '') !~* '^https?://[^\s/]+\.[^\s/]{2,}' THEN
      RETURN format('Fonte %s: cole o link completo (https://).', _i); END IF;
    _au := btrim(coalesce(_a->>'authors', ''));
    IF _au = '' AND btrim(coalesce(_a->>'abnt_citation', '')) = '' THEN
      RETURN format('Fonte %s: informe os autores.', _i); END IF;
    IF _au <> '' THEN
      IF array_length(regexp_split_to_array(_au, '\s+'), 1) < 2 THEN
        RETURN format('Fonte %s: autores precisam de nome e sobrenome.', _i); END IF;
      FOR _name IN SELECT lower(btrim(pr.name)) FROM public.group_members gm JOIN public.profiles pr ON pr.id = gm.student_id
        WHERE gm.group_id = _p.group_id AND array_length(regexp_split_to_array(btrim(coalesce(pr.name,'')), '\s+'), 1) >= 2 LOOP
        IF position(_name IN lower(_au)) > 0 THEN
          RETURN format('Fonte %s: o autor não pode ser integrante do grupo.', _i); END IF;
      END LOOP;
    END IF;
    _y := coalesce(nullif(btrim(coalesce(_a->>'year', '')), ''), substring(coalesce(_a->>'abnt_citation', '') FROM '(?:19|20)\d{2}'));
    IF _y IS NULL OR _y !~ '^\d{4}$' THEN RETURN format('Fonte %s: informe o ano.', _i); END IF;
    _yn := _y::int;
    IF _yn < 1970 OR _yn > extract(year FROM now())::int THEN
      RETURN format('Fonte %s: ano fora do intervalo 1970 até hoje.', _i); END IF;
    -- duplicates inside the group (same link, DOI or title)
    _u := regexp_replace(regexp_replace(regexp_replace(regexp_replace(lower(btrim(_a->>'url')), '^https?://', ''), '^www\.', ''), '[#?].*$', ''), '/+$', '');
    _d := lower(regexp_replace(substring(coalesce(_a->>'url','') FROM '10\.\d{4,9}/[^\s"<>]+'), '[.,;)]+$', ''));
    _tk := regexp_replace(lower(public.fold_text(_t)), '[^a-z0-9]', '', 'g');
    _j := coalesce(array_position(_us, _u), CASE WHEN _d IS NOT NULL THEN array_position(_ds, _d) END,
                   CASE WHEN length(_tk) >= 10 THEN array_position(_ts, _tk) END);
    IF _j IS NOT NULL THEN
      RETURN format('Fonte %s: repete o mesmo artigo já cadastrado na Fonte %s. As fontes do grupo devem ser diferentes entre si.', _i, _j); END IF;
    _us := _us || _u; _ds := _ds || coalesce(_d, '#' || _i); _ts := _ts || CASE WHEN length(_tk) >= 10 THEN _tk ELSE '#' || _i END;
  END LOOP;
  RETURN NULL;
END $f$;
REVOKE EXECUTE ON FUNCTION public.article_problem(public.projects) FROM PUBLIC, anon, authenticated;