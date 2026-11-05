-- Delivery times of every group in a class, so students can see their stage podium (gold/silver/bronze/honor)
-- without reading other groups' projects. Only the class's teacher or its students may call it.
CREATE OR REPLACE FUNCTION public.class_medal_deliveries(_class_id UUID)
RETURNS TABLE (group_id UUID, phase_number INT, submitted_at TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.teaches_class(_class_id) OR public.is_class_student(_class_id)) THEN
    RAISE EXCEPTION 'Sem acesso a esta turma.';
  END IF;
  RETURN QUERY
    SELECT p.group_id, s.phase_number, s.submitted_at
    FROM public.phase_submissions s
    JOIN public.projects p ON p.id = s.project_id
    JOIN public.groups g ON g.id = p.group_id
    WHERE g.class_id = _class_id;
END;
$$;
REVOKE ALL ON FUNCTION public.class_medal_deliveries(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.class_medal_deliveries(UUID) TO authenticated;