ALTER TABLE public.classes ADD COLUMN code_area_order TEXT[];
COMMENT ON COLUMN public.classes.code_area_order IS 'Teacher-wide (same on all her classes): when set, project numbering groups projects by area in this order, then by class order and group registration.';

CREATE OR REPLACE FUNCTION public.renumber_projects(_class_ids UUID[], _area_codes TEXT[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _id UUID;
  _pos INTEGER := 0;
  _count INTEGER;
  _areas TEXT[] := CASE WHEN cardinality(coalesce(_area_codes, '{}')) = 0 THEN NULL ELSE _area_codes END;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'teacher') THEN
    RAISE EXCEPTION 'Apenas a professora pode numerar os projetos';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('project_code_number:' || auth.uid()::text));
  UPDATE public.classes SET code_order = NULL, code_area_order = _areas WHERE teacher_id = auth.uid();
  FOREACH _id IN ARRAY coalesce(_class_ids, '{}'::uuid[]) LOOP
    IF NOT public.teaches_class(_id) THEN
      RAISE EXCEPTION 'Turma não encontrada';
    END IF;
    _pos := _pos + 1;
    UPDATE public.classes SET code_order = _pos WHERE id = _id AND code_order IS NULL;
  END LOOP;
  WITH ordered AS (
    SELECT p.id, row_number() OVER (
      ORDER BY
        CASE WHEN _areas IS NULL THEN 0 ELSE coalesce(array_position(_areas, p.area_code), 1000) END,
        c.code_order NULLS LAST, c.created_at, c.id, g.created_at, p.id
    ) AS rn
    FROM public.projects p
    JOIN public.groups g ON g.id = p.group_id
    JOIN public.classes c ON c.id = g.class_id
    WHERE c.teacher_id = auth.uid()
  )
  UPDATE public.projects p SET code_number = o.rn FROM ordered o WHERE o.id = p.id;
  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$function$;

REVOKE ALL ON FUNCTION public.renumber_projects(UUID[], TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.renumber_projects(UUID[], TEXT[]) TO authenticated;