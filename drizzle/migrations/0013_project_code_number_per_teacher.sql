ALTER TABLE public.classes ADD COLUMN code_order INTEGER;
COMMENT ON COLUMN public.classes.code_order IS 'Position the teacher chose for this class when numbering her projects (01, 02...).';

ALTER TABLE public.projects ADD COLUMN code_number INTEGER;
COMMENT ON COLUMN public.projects.code_number IS 'Last part of the project code: one count per teacher across all her classes, in the class order she chose, then group registration order.';
COMMENT ON COLUMN public.projects.project_seq IS 'DEPRECATED: replaced by code_number in the project code; kept as the immutable site-wide registration order.';

-- Backfill: each teacher's projects numbered 01.. by class creation, then group creation.
WITH ordered AS (
  SELECT p.id, row_number() OVER (PARTITION BY c.teacher_id ORDER BY c.created_at, c.id, g.created_at, p.id) AS rn
  FROM public.projects p
  JOIN public.groups g ON g.id = p.group_id
  JOIN public.classes c ON c.id = g.class_id
)
UPDATE public.projects p SET code_number = o.rn FROM ordered o WHERE o.id = p.id;

-- New projects get the next number in their teacher's count.
CREATE OR REPLACE FUNCTION public.assign_project_code_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _teacher UUID;
BEGIN
  IF NEW.code_number IS NOT NULL THEN RETURN NEW; END IF;
  SELECT c.teacher_id INTO _teacher
  FROM public.groups g JOIN public.classes c ON c.id = g.class_id
  WHERE g.id = NEW.group_id;
  IF _teacher IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('project_code_number:' || _teacher::text));
  SELECT coalesce(max(p.code_number), 0) + 1 INTO NEW.code_number
  FROM public.projects p
  JOIN public.groups g ON g.id = p.group_id
  JOIN public.classes c ON c.id = g.class_id
  WHERE c.teacher_id = _teacher;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER projects_assign_code_number
  BEFORE INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.assign_project_code_number();

-- Only the class's teacher may change the number (through renumber_projects).
CREATE OR REPLACE FUNCTION public.guard_project_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := now();
  IF NEW.current_phase IS DISTINCT FROM OLD.current_phase
     AND NOT public.teaches_group(OLD.group_id)
     AND current_setting('app.phase_advance', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Somente a professora pode mudar a etapa diretamente';
  END IF;
  IF NEW.group_id IS DISTINCT FROM OLD.group_id THEN
    RAISE EXCEPTION 'O grupo do projeto não pode ser alterado';
  END IF;
  IF NEW.project_seq IS DISTINCT FROM OLD.project_seq THEN
    RAISE EXCEPTION 'O número do projeto não pode ser alterado';
  END IF;
  IF NEW.code_number IS DISTINCT FROM OLD.code_number
     AND NOT public.teaches_group(OLD.group_id) THEN
    RAISE EXCEPTION 'Somente a professora pode mudar o número do projeto';
  END IF;
  IF NEW.area_code IS DISTINCT FROM OLD.area_code
     AND OLD.area_code IS NOT NULL
     AND NOT public.teaches_group(OLD.group_id) THEN
    RAISE EXCEPTION 'Somente a professora pode mudar a área do projeto';
  END IF;
  RETURN NEW;
END;
$function$;

-- Teacher renumbers all her projects 01.. starting with the classes in the order she lists.
CREATE OR REPLACE FUNCTION public.renumber_projects(_class_ids UUID[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _id UUID;
  _pos INTEGER := 0;
  _count INTEGER;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'teacher') THEN
    RAISE EXCEPTION 'Apenas a professora pode numerar os projetos';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('project_code_number:' || auth.uid()::text));
  UPDATE public.classes SET code_order = NULL WHERE teacher_id = auth.uid();
  FOREACH _id IN ARRAY coalesce(_class_ids, '{}'::uuid[]) LOOP
    IF NOT public.teaches_class(_id) THEN
      RAISE EXCEPTION 'Turma não encontrada';
    END IF;
    _pos := _pos + 1;
    UPDATE public.classes SET code_order = _pos WHERE id = _id AND code_order IS NULL;
  END LOOP;
  WITH ordered AS (
    SELECT p.id, row_number() OVER (
      ORDER BY c.code_order NULLS LAST, c.created_at, c.id, g.created_at, p.id
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

REVOKE ALL ON FUNCTION public.renumber_projects(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.renumber_projects(UUID[]) TO authenticated;
REVOKE ALL ON FUNCTION public.assign_project_code_number() FROM PUBLIC, anon, authenticated;