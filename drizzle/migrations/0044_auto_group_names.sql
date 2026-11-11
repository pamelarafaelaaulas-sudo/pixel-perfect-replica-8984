CREATE OR REPLACE FUNCTION public.refresh_group_name(_group_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _n text;
BEGIN
  SELECT string_agg(fn, ', ' ORDER BY lower(fn)) INTO _n FROM (
    SELECT coalesce(nullif(split_part(trim(p.name), ' ', 1), ''), 'Aluno') AS fn
    FROM public.group_members m JOIN public.profiles p ON p.id = m.student_id
    WHERE m.group_id = _group_id) s;
  IF _n IS NOT NULL THEN UPDATE public.groups SET group_name = _n WHERE id = _group_id; END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.refresh_group_name(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.group_members_rename()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.refresh_group_name(coalesce(NEW.group_id, OLD.group_id));
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS group_members_rename ON public.group_members;
CREATE TRIGGER group_members_rename AFTER INSERT OR DELETE ON public.group_members
FOR EACH ROW EXECUTE FUNCTION public.group_members_rename();

SELECT public.refresh_group_name(id) FROM public.groups;