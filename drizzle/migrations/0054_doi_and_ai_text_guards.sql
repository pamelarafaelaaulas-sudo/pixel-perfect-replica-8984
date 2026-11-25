CREATE OR REPLACE FUNCTION public.ai_text_marker(_t text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $f$
  SELECT coalesce(lower(_t), '') ~* ANY (ARRAY[
    'como (um|uma) (modelo de linguagem|ia|intelig[eê]ncia artificial|assistente)',
    '\mas an ai\M', '\mlanguage model\M',
    '\mchat ?gpt\M', '\mopenai\M', '\mcopilot\M', '\mgemini\M',
    '(claro|certamente|com certeza)[!,.] ?(aqui (est[aá]|est[aã]o|vai)|segue)',
    'espero (que isso|ter) ajud',
    '\[(inserir|insira|seu nome|nome|autor|ano|cidade|escola)[^\]]*\]',
    '\*\*[^*]+\*\*'
  ])
$f$;

CREATE OR REPLACE FUNCTION public.phase_rule_problem(_p projects, _phase integer)
 RETURNS text LANGUAGE plpgsql STABLE SET search_path TO 'public'
AS $function$
DECLARE
  _problem TEXT; _template TEXT; _form TEXT; _video TEXT; _a jsonb; _i int := 0;
BEGIN
  _problem := public.phase_rule_problem_base(_p, _phase);
  IF _problem IS NULL THEN _problem := public.ethics_extra_problem(_p, _phase); END IF;
  IF _problem IS NOT NULL THEN RETURN _problem; END IF;
  IF _phase = 2 THEN
    FOR _a IN SELECT * FROM jsonb_array_elements(coalesce(_p.scientific_articles, '[]'::jsonb)) LOOP
      _i := _i + 1;
      IF coalesce(_a->>'url', '') ~* '10\.\d{4,9}/\S+' AND coalesce((_a->>'doi_verified')::boolean, false) = false THEN
        RETURN format('Fonte %s: o DOI ainda não foi confirmado na base mundial de artigos.', _i);
      END IF;
    END LOOP;
    RETURN NULL;
  END IF;
  IF _phase BETWEEN 4 AND 12 AND _phase <> 11 AND public.ai_text_marker(public.written_phase_text(_p, _phase)) THEN
    RETURN 'O texto tem sinal de ter sido copiado de uma IA. Reescreva com as palavras do grupo.';
  END IF;
  IF _phase NOT IN (1, 7, 13) THEN RETURN NULL; END IF;
  SELECT c.banner_template_url, c.ethics_form_template_url, c.diary_video_url INTO _template, _form, _video
  FROM public.groups g JOIN public.classes c ON c.id = g.class_id WHERE g.id = _p.group_id;
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
REVOKE EXECUTE ON FUNCTION public.ai_text_marker(text) FROM PUBLIC, anon;