CREATE OR REPLACE FUNCTION public.refresh_group_name(_group_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _n text;
BEGIN
  SELECT string_agg(fn, ', ' ORDER BY lower(fn)) INTO _n FROM (
    SELECT coalesce(nullif(
      CASE WHEN array_length(w, 1) > 1 THEN w[1] || ' ' || w[array_length(w, 1)] ELSE w[1] END, ''), 'Aluno') AS fn
    FROM (SELECT regexp_split_to_array(trim(p.name), '\s+') AS w
          FROM public.group_members m JOIN public.profiles p ON p.id = m.student_id
          WHERE m.group_id = _group_id) x) s;
  IF _n IS NOT NULL THEN UPDATE public.groups SET group_name = _n WHERE id = _group_id; END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.refresh_group_name(uuid) FROM PUBLIC, anon, authenticated;
SELECT public.refresh_group_name(id) FROM public.groups;