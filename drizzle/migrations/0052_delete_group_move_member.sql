CREATE OR REPLACE FUNCTION public.delete_group(_group_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.teaches_group(_group_id) THEN
    RAISE EXCEPTION 'Você só pode excluir grupos das suas turmas.';
  END IF;
  DELETE FROM public.groups WHERE id = _group_id;
END $$;
REVOKE ALL ON FUNCTION public.delete_group(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_group(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.move_member(_member_id uuid, _target_group_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _old uuid; _student uuid; _class uuid;
BEGIN
  SELECT group_id, student_id INTO _old, _student FROM public.group_members WHERE id = _member_id;
  IF _old IS NULL THEN RAISE EXCEPTION 'Aluno não encontrado.'; END IF;
  IF NOT public.teaches_group(_old) OR NOT public.teaches_group(_target_group_id) THEN
    RAISE EXCEPTION 'Você só pode mover alunos entre grupos das suas turmas.';
  END IF;
  IF _old = _target_group_id THEN RAISE EXCEPTION 'O aluno já está nesse grupo.'; END IF;
  IF (SELECT count(*) FROM public.group_members WHERE group_id = _target_group_id) >= 3 THEN
    RAISE EXCEPTION 'O grupo de destino já tem 3 alunos.';
  END IF;
  SELECT class_id INTO _class FROM public.groups WHERE id = _target_group_id;
  UPDATE public.group_responsibilities SET leader_student_id = NULL WHERE group_id = _old AND leader_student_id = _student;
  UPDATE public.group_responsibilities SET diary_student_id = NULL WHERE group_id = _old AND diary_student_id = _student;
  UPDATE public.group_members SET group_id = _target_group_id, class_id = _class WHERE id = _member_id;
  PERFORM public.refresh_group_name(_old);
  PERFORM public.refresh_group_name(_target_group_id);
END $$;
REVOKE ALL ON FUNCTION public.move_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.move_member(uuid, uuid) TO authenticated;