-- Students no longer read AI scores; they only get the written suggestions through this function.
DROP POLICY IF EXISTS "Members read own group AI evaluations" ON public.ai_evaluations;

CREATE OR REPLACE FUNCTION public.group_ai_suggestions(_group_id UUID)
RETURNS TABLE (id UUID, phase_number INT, requested_by UUID, created_at TIMESTAMPTZ, summary TEXT, tips JSONB, criteria JSONB)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id, e.phase_number, e.requested_by, e.created_at, e.summary, e.tips,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('key', c->>'key', 'comment', COALESCE(c->>'comment', '')))
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(e.criteria) = 'array' THEN e.criteria ELSE '[]'::jsonb END) c
    ), '[]'::jsonb)
  FROM public.ai_evaluations e
  WHERE e.group_id = _group_id AND public.is_group_member(_group_id)
  ORDER BY e.created_at DESC
$$;

REVOKE EXECUTE ON FUNCTION public.group_ai_suggestions(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.group_ai_suggestions(UUID) TO authenticated;
