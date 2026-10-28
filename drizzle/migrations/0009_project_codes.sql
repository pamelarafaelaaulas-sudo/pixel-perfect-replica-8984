CREATE SEQUENCE IF NOT EXISTS public.project_code_seq;

ALTER TABLE public.projects ADD COLUMN area_code TEXT, ADD COLUMN project_seq INTEGER;
ALTER TABLE public.projects ADD CONSTRAINT projects_area_code_check
  CHECK (area_code IS NULL OR area_code IN ('AGR','BIO','EXA','HUM','SOC','SAU','ENG','LIN'));

-- Existing projects get their number in the order their groups were created.
WITH ordered AS (
  SELECT p.id, row_number() OVER (ORDER BY g.created_at, p.id) AS rn
  FROM public.projects p JOIN public.groups g ON g.id = p.group_id
)
UPDATE public.projects p SET project_seq = o.rn FROM ordered o WHERE o.id = p.id;

SELECT setval('public.project_code_seq', coalesce((SELECT max(project_seq) FROM public.projects), 0) + 1, false);
ALTER SEQUENCE public.project_code_seq OWNED BY public.projects.project_seq;
ALTER TABLE public.projects ALTER COLUMN project_seq SET DEFAULT nextval('public.project_code_seq');
ALTER TABLE public.projects ADD CONSTRAINT projects_project_seq_key UNIQUE (project_seq);
GRANT USAGE ON SEQUENCE public.project_code_seq TO service_role;

COMMENT ON COLUMN public.projects.area_code IS 'Area abbreviation used as the first part of the project code (AREA-CLASSLABEL-000).';
COMMENT ON COLUMN public.projects.project_seq IS 'Site-wide registration order; last part of the project code.';

ALTER TABLE public.classes ADD COLUMN code_label TEXT;
ALTER TABLE public.classes ADD CONSTRAINT classes_code_label_check
  CHECK (code_label IS NULL OR code_label ~ '^[A-Z0-9]{1,8}$');
COMMENT ON COLUMN public.classes.code_label IS 'Short class label chosen by the teacher; middle part of the project code.';

-- Students may pick the area once (legacy projects); only the teacher may change it. Nobody changes the number.
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
  IF NEW.area_code IS DISTINCT FROM OLD.area_code
     AND OLD.area_code IS NOT NULL
     AND NOT public.teaches_group(OLD.group_id) THEN
    RAISE EXCEPTION 'Somente a professora pode mudar a área do projeto';
  END IF;
  RETURN NEW;
END;
$function$;

DROP FUNCTION IF EXISTS public.create_group(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.create_group(_code TEXT, _group_name TEXT, _whatsapp TEXT, _area TEXT)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _class_id UUID;
  _group_id UUID;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'student') THEN
    RAISE EXCEPTION 'Apenas alunos podem criar grupos';
  END IF;
  IF coalesce(trim(_group_name), '') = '' OR coalesce(trim(_whatsapp), '') = '' THEN
    RAISE EXCEPTION 'Informe o nome do grupo e seu WhatsApp';
  END IF;
  IF _area IS NULL OR _area NOT IN ('AGR','BIO','EXA','HUM','SOC','SAU','ENG','LIN') THEN
    RAISE EXCEPTION 'Escolha a área do projeto';
  END IF;
  SELECT id INTO _class_id FROM public.classes WHERE class_code = upper(trim(_code));
  IF _class_id IS NULL THEN RAISE EXCEPTION 'Turma não encontrada'; END IF;
  IF EXISTS (SELECT 1 FROM public.group_members WHERE class_id = _class_id AND student_id = auth.uid()) THEN
    RAISE EXCEPTION 'Você já faz parte de um grupo nesta turma';
  END IF;
  INSERT INTO public.groups (class_id, group_name) VALUES (_class_id, trim(_group_name)) RETURNING id INTO _group_id;
  INSERT INTO public.group_members (group_id, class_id, student_id, whatsapp) VALUES (_group_id, _class_id, auth.uid(), trim(_whatsapp));
  INSERT INTO public.projects (group_id, area_code) VALUES (_group_id, _area);
  UPDATE public.profiles SET whatsapp = trim(_whatsapp) WHERE id = auth.uid();
  RETURN _group_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_group(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_group(TEXT, TEXT, TEXT, TEXT) TO authenticated;