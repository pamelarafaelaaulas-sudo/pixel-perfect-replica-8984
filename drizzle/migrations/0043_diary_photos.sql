ALTER TABLE public.diary_entries ADD COLUMN photo_path text;
COMMENT ON COLUMN public.diary_entries.photo_path IS 'Photo of the physical diary page in bucket diary-photos at <group_id>/<file>; new entries require it.';
CREATE OR REPLACE FUNCTION public.guard_diary_entry()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE
  _today DATE := (now() AT TIME ZONE 'America/Campo_Grande')::date;
BEGIN
  NEW.created_at := now();
  NEW.content := btrim(NEW.content);
  IF NEW.photo_path IS NULL OR split_part(NEW.photo_path, '/', 1) <> NEW.group_id::text THEN
    RAISE EXCEPTION 'Envie a foto da página do diário físico.';
  END IF;
  IF NEW.entry_date > _today THEN
    RAISE EXCEPTION 'A data do registro não pode ser no futuro.';
  END IF;
  IF NEW.entry_date < _today - 7 THEN
    RAISE EXCEPTION 'Registre no máximo com 7 dias de atraso. O diário precisa ser contínuo.';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.submit_group_diary(_group_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.group_responsibilities; snapshot jsonb; submission_id uuid;
BEGIN
 IF NOT public.is_group_member(_group_id) THEN RAISE EXCEPTION 'Você não pertence a este grupo.'; END IF;
 PERFORM 1 FROM public.groups WHERE id = _group_id FOR UPDATE;
 SELECT * INTO r FROM public.group_responsibilities WHERE group_id = _group_id;
 IF r.leader_student_id IS NULL OR r.diary_student_id IS NULL THEN RAISE EXCEPTION 'Escolham o líder e o responsável pelo diário antes de enviar.'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.group_members WHERE group_id=_group_id AND student_id=r.leader_student_id) OR NOT EXISTS (SELECT 1 FROM public.group_members WHERE group_id=_group_id AND student_id=r.diary_student_id) THEN RAISE EXCEPTION 'Os responsáveis devem pertencer ao grupo.'; END IF;
 IF EXISTS (SELECT 1 FROM public.diary_submissions WHERE group_id=_group_id AND status='pending') THEN RAISE EXCEPTION 'O diário já está aguardando aprovação.'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.diary_entries WHERE group_id=_group_id AND photo_path IS NOT NULL) THEN RAISE EXCEPTION 'Enviem pelo menos uma foto do diário físico antes de enviar.'; END IF;
 SELECT jsonb_agg(jsonb_build_object('id',id,'student_id',student_id,'entry_date',entry_date,'kind',kind,'content',content,'created_at',created_at,'photo_path',photo_path) ORDER BY entry_date,created_at,id) INTO snapshot FROM public.diary_entries WHERE group_id=_group_id;
 IF EXISTS (SELECT 1 FROM public.diary_submissions WHERE id=(SELECT id FROM public.diary_submissions WHERE group_id=_group_id ORDER BY submitted_at DESC,id DESC LIMIT 1) AND entries_snapshot=snapshot) THEN RAISE EXCEPTION 'Enviem uma nova foto antes de reenviar o diário.'; END IF;
 INSERT INTO public.diary_submissions(group_id,leader_student_id,diary_student_id,submitted_by,entries_snapshot) VALUES (_group_id,r.leader_student_id,r.diary_student_id,auth.uid(),snapshot) RETURNING id INTO submission_id;
 RETURN submission_id;
END; $$;
CREATE POLICY "Members upload diary photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'diary-photos' AND public.is_group_member(((storage.foldername(name))[1])::uuid));
CREATE POLICY "Members and teacher read diary photos" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'diary-photos' AND (public.is_group_member(((storage.foldername(name))[1])::uuid) OR public.teaches_group(((storage.foldername(name))[1])::uuid)));