CREATE OR REPLACE FUNCTION public.medal_scoreboard(_class_id uuid DEFAULT NULL)
RETURNS TABLE(group_id uuid, group_name text, class_id uuid, class_name text, pool_key text, phase_number integer, kind text, submitted_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF _class_id IS NOT NULL AND NOT (public.teaches_class(_class_id) OR public.is_class_student(_class_id)) THEN RAISE EXCEPTION 'Sem acesso a esta turma.'; END IF;
 IF _class_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.classes c WHERE c.teacher_id = auth.uid() AND public.teaches_class(c.id)) THEN RAISE EXCEPTION 'Sem acesso.'; END IF;
 RETURN QUERY WITH eligible_classes AS (
 SELECT c.id, c.name, CASE WHEN nullif(btrim(c.medal_pool),'') IS NULL THEN 'class:'||c.id::text ELSE 'pool:'||c.teacher_id::text||':'||lower(btrim(c.medal_pool)) END AS pool
 FROM public.classes c WHERE (_class_id IS NULL AND c.teacher_id=auth.uid() AND public.teaches_class(c.id)) OR (_class_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.classes own WHERE own.id=_class_id AND (c.id=own.id OR (c.teacher_id=own.teacher_id AND nullif(btrim(own.medal_pool),'') IS NOT NULL AND lower(btrim(c.medal_pool))=lower(btrim(own.medal_pool))))))
 ), deliveries AS (
 SELECT g.id AS gid, s.phase_number AS phase, s.submitted_at AS at, ec.pool, sc.due_date,
 CASE WHEN s.phase_number=13 THEN (SELECT bd.total FROM public.banner_diagnoses bd WHERE bd.group_id=g.id ORDER BY bd.created_at DESC,bd.id DESC LIMIT 1)
 ELSE (SELECT ai.overall FROM public.ai_evaluations ai WHERE ai.group_id=g.id AND ai.phase_number=s.phase_number ORDER BY ai.created_at DESC,ai.id DESC LIMIT 1) END AS quality
 FROM eligible_classes ec JOIN public.groups g ON g.class_id=ec.id JOIN public.projects p ON p.group_id=g.id JOIN public.phase_submissions s ON s.project_id=p.id JOIN public.schedules sc ON sc.class_id=ec.id AND sc.phase_number=s.phase_number WHERE s.submitted_at<=sc.due_date
 ), ranked AS (
 SELECT d.*, row_number() OVER(PARTITION BY d.pool,d.phase ORDER BY d.quality DESC,(d.due_date-d.at) DESC,d.gid) AS place FROM deliveries d WHERE d.quality IS NOT NULL
 )
 SELECT g.id,g.group_name,ec.id,ec.name,ec.pool,r.phase,CASE WHEN r.place=1 THEN 'ouro' WHEN r.place=2 THEN 'prata' WHEN r.place=3 THEN 'bronze' WHEN r.place>3 THEN 'honra' ELSE NULL END,r.at FROM eligible_classes ec JOIN public.groups g ON g.class_id=ec.id LEFT JOIN ranked r ON r.gid=g.id;
END; $$;
REVOKE ALL ON FUNCTION public.medal_scoreboard(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.medal_scoreboard(uuid) TO authenticated,service_role;
COMMENT ON FUNCTION public.medal_scoreboard(uuid) IS 'Quality-first pool medals with private AI scores and own-deadline tie breaks; results remain provisional as evaluations arrive.';