CREATE TABLE public.diary_submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
 leader_student_id uuid NOT NULL REFERENCES public.profiles(id),
 diary_student_id uuid NOT NULL REFERENCES public.profiles(id),
 submitted_by uuid NOT NULL REFERENCES public.profiles(id),
 submitted_at timestamptz NOT NULL DEFAULT now(),
 entries_snapshot jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','changes_requested')),
 teacher_note text,
 reviewed_by uuid REFERENCES public.profiles(id),
 reviewed_at timestamptz
);
GRANT SELECT ON public.diary_submissions TO authenticated;
GRANT ALL ON public.diary_submissions TO service_role;
ALTER TABLE public.diary_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Group and owning teacher read diary submissions" ON public.diary_submissions FOR SELECT TO authenticated USING (public.is_group_member(group_id) OR public.teaches_group(group_id));
CREATE UNIQUE INDEX diary_one_pending_submission ON public.diary_submissions(group_id) WHERE status = 'pending';
CREATE FUNCTION public.submit_group_diary(_group_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.group_responsibilities; snapshot jsonb; submission_id uuid;
BEGIN
 IF NOT public.is_group_member(_group_id) THEN RAISE EXCEPTION 'Você não pertence a este grupo.'; END IF;
 PERFORM 1 FROM public.groups WHERE id = _group_id FOR UPDATE;
 SELECT * INTO r FROM public.group_responsibilities WHERE group_id = _group_id;
 IF r.leader_student_id IS NULL OR r.diary_student_id IS NULL THEN RAISE EXCEPTION 'Escolham o líder e o responsável pelo diário antes de enviar.'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.group_members WHERE group_id=_group_id AND student_id=r.leader_student_id) OR NOT EXISTS (SELECT 1 FROM public.group_members WHERE group_id=_group_id AND student_id=r.diary_student_id) THEN RAISE EXCEPTION 'Os responsáveis devem pertencer ao grupo.'; END IF;
 IF EXISTS (SELECT 1 FROM public.diary_submissions WHERE group_id=_group_id AND status='pending') THEN RAISE EXCEPTION 'O diário já está aguardando aprovação.'; END IF;
 SELECT jsonb_agg(jsonb_build_object('id',id,'student_id',student_id,'entry_date',entry_date,'kind',kind,'content',content,'created_at',created_at) ORDER BY entry_date,created_at,id) INTO snapshot FROM public.diary_entries WHERE group_id=_group_id;
 IF snapshot IS NULL THEN RAISE EXCEPTION 'Salvem pelo menos um registro no diário antes de enviar.'; END IF;
 IF EXISTS (SELECT 1 FROM public.diary_submissions WHERE id=(SELECT id FROM public.diary_submissions WHERE group_id=_group_id ORDER BY submitted_at DESC,id DESC LIMIT 1) AND entries_snapshot=snapshot) THEN RAISE EXCEPTION 'Acrescentem um novo registro antes de reenviar o diário.'; END IF;
 INSERT INTO public.diary_submissions(group_id,leader_student_id,diary_student_id,submitted_by,entries_snapshot) VALUES (_group_id,r.leader_student_id,r.diary_student_id,auth.uid(),snapshot) RETURNING id INTO submission_id;
 RETURN submission_id;
END; $$;
REVOKE ALL ON FUNCTION public.submit_group_diary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_group_diary(uuid) TO authenticated;
CREATE FUNCTION public.review_group_diary(_submission_id uuid, _approve boolean, _note text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.diary_submissions;
BEGIN
 SELECT * INTO s FROM public.diary_submissions WHERE id=_submission_id FOR UPDATE;
 IF s.id IS NULL OR NOT public.teaches_group(s.group_id) THEN RAISE EXCEPTION 'Somente a professora do grupo pode aprovar o diário.'; END IF;
 IF s.status <> 'pending' THEN RAISE EXCEPTION 'Este envio já foi revisado.'; END IF;
 IF NOT _approve AND length(trim(coalesce(_note,'')))=0 THEN RAISE EXCEPTION 'Escreva as orientações antes de devolver.'; END IF;
 UPDATE public.diary_submissions SET status=CASE WHEN _approve THEN 'approved' ELSE 'changes_requested' END,teacher_note=nullif(trim(_note),''),reviewed_by=auth.uid(),reviewed_at=now() WHERE id=_submission_id;
END; $$;
REVOKE ALL ON FUNCTION public.review_group_diary(uuid,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_group_diary(uuid,boolean,text) TO authenticated;