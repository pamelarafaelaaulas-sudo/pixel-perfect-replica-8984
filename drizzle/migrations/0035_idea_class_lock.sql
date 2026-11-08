DROP FUNCTION public.idea_usage();
CREATE FUNCTION public.idea_usage() RETURNS TABLE(idea_id uuid, group_id uuid, class_id uuid, group_name text, class_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.idea_id, g.id, c.id, g.group_name, c.name
  FROM public.projects p JOIN public.groups g ON g.id = p.group_id JOIN public.classes c ON c.id = g.class_id
  JOIN public.idea_bank i ON i.id = p.idea_id
  WHERE i.teacher_id = auth.uid()
     OR EXISTS (SELECT 1 FROM public.classes c2 WHERE c2.teacher_id = i.teacher_id AND public.is_class_student(c2.id));
$$;
REVOKE EXECUTE ON FUNCTION public.idea_usage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.idea_usage() TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_idea_per_class() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _class uuid; _other text;
BEGIN
  IF NEW.idea_id IS NULL OR NEW.idea_id IS NOT DISTINCT FROM OLD.idea_id THEN RETURN NEW; END IF;
  SELECT class_id INTO _class FROM public.groups WHERE id = NEW.group_id;
  PERFORM pg_advisory_xact_lock(hashtext(_class::text || NEW.idea_id::text));
  SELECT g.group_name INTO _other FROM public.projects p JOIN public.groups g ON g.id = p.group_id
   WHERE p.idea_id = NEW.idea_id AND g.class_id = _class AND p.id <> NEW.id LIMIT 1;
  IF _other IS NOT NULL THEN
    RAISE EXCEPTION 'Esta ideia já está em uso pelo grupo "%" da sua turma. Escolha outra ideia.', _other;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_idea_per_class BEFORE UPDATE OF idea_id ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.guard_idea_per_class();