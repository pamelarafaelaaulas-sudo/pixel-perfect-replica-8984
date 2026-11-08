ALTER TABLE public.projects ADD COLUMN idea_id uuid REFERENCES public.idea_bank(id) ON DELETE SET NULL;
CREATE INDEX projects_idea_idx ON public.projects(idea_id);
CREATE OR REPLACE FUNCTION public.idea_usage() RETURNS TABLE(idea_id uuid, group_name text, class_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.idea_id, g.group_name, c.name
  FROM public.projects p JOIN public.groups g ON g.id = p.group_id JOIN public.classes c ON c.id = g.class_id
  JOIN public.idea_bank i ON i.id = p.idea_id
  WHERE i.teacher_id = auth.uid()
     OR EXISTS (SELECT 1 FROM public.classes c2 WHERE c2.teacher_id = i.teacher_id AND public.is_class_student(c2.id));
$$;
REVOKE EXECUTE ON FUNCTION public.idea_usage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.idea_usage() TO authenticated;