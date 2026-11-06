ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS medal_pool TEXT;
COMMENT ON COLUMN public.classes.medal_pool IS 'Classes of the same teacher with the same label compete together for stage medals; NULL = the class competes alone.';

-- Deliveries of every group competing with this class (same teacher + same medal_pool, or just the class),
-- each with its own class deadline for that stage.
CREATE OR REPLACE FUNCTION public.medal_pool_deliveries(_class_id UUID)
RETURNS TABLE (group_id UUID, class_id UUID, phase_number INT, submitted_at TIMESTAMPTZ, due_date TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _teacher UUID; _pool TEXT;
BEGIN
  IF NOT (public.teaches_class(_class_id) OR public.is_class_student(_class_id)) THEN
    RAISE EXCEPTION 'Sem acesso a esta turma.';
  END IF;
  SELECT c.teacher_id, NULLIF(btrim(c.medal_pool), '') INTO _teacher, _pool FROM public.classes c WHERE c.id = _class_id;
  RETURN QUERY
    SELECT p.group_id, g.class_id, s.phase_number, s.submitted_at, sc.due_date
    FROM public.phase_submissions s
    JOIN public.projects p ON p.id = s.project_id
    JOIN public.groups g ON g.id = p.group_id
    JOIN public.classes c ON c.id = g.class_id
    LEFT JOIN public.schedules sc ON sc.class_id = g.class_id AND sc.phase_number = s.phase_number
    WHERE g.class_id = _class_id
       OR (_pool IS NOT NULL AND c.teacher_id = _teacher AND NULLIF(btrim(c.medal_pool), '') = _pool);
END;
$$;
REVOKE ALL ON FUNCTION public.medal_pool_deliveries(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.medal_pool_deliveries(UUID) TO authenticated;
COMMENT ON FUNCTION public.class_medal_deliveries(UUID) IS 'DEPRECATED: replaced by medal_pool_deliveries';