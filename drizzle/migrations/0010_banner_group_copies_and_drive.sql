-- Which banner file was last copied to the teacher's Google Drive, per project.
-- Written only by the server (admin client) after checking the caller; no client writes.
CREATE TABLE public.banner_drive_files (
  project_id UUID PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  drive_file_id TEXT NOT NULL,
  source_path TEXT NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.banner_drive_files TO authenticated;
GRANT ALL ON public.banner_drive_files TO service_role;
ALTER TABLE public.banner_drive_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teacher reads own class banner drive files" ON public.banner_drive_files
  FOR SELECT TO authenticated USING (public.teaches_group(group_id));

-- Canva design id from a canva.com/design/<id>/... link (NULL for short links or other URLs).
CREATE OR REPLACE FUNCTION public.canva_design_id(_url TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT (regexp_match(coalesce(_url, ''), 'canva\.com/design/([A-Za-z0-9_-]+)', 'i'))[1]
$$;

-- Stage rules stay in phase_rule_problem_base; this wrapper adds the "group's own copy" banner rule.
ALTER FUNCTION public.phase_rule_problem(public.projects, INT) RENAME TO phase_rule_problem_base;

CREATE FUNCTION public.phase_rule_problem(_p public.projects, _phase INT)
RETURNS TEXT LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  _problem TEXT;
  _template TEXT;
BEGIN
  _problem := public.phase_rule_problem_base(_p, _phase);
  IF _problem IS NOT NULL OR _phase <> 13 THEN RETURN _problem; END IF;
  SELECT c.banner_template_url INTO _template
  FROM public.groups g JOIN public.classes c ON c.id = g.class_id
  WHERE g.id = _p.group_id;
  IF public.canva_design_id(_p.banner_canva_url) IS NOT NULL
     AND lower(public.canva_design_id(_p.banner_canva_url)) = lower(public.canva_design_id(_template)) THEN
    RETURN 'Esse é o link do modelo da professora. Use o modelo no Canva e cole o link da cópia do grupo.';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.phase_rule_problem(public.projects, INT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.phase_rule_problem_base(public.projects, INT) FROM PUBLIC, anon, authenticated;