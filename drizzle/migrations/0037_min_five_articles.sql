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
    WHEN 2 THEN IF jsonb_array_length(coalesce(_p.scientific_articles, '[]'::jsonb)) < 5 THEN RETURN 'Cadastrem pelo menos 5 fontes antes de entregar.'; END IF;
    ELSE NULL;
  END CASE;
  RETURN NULL;
END;
$function$;