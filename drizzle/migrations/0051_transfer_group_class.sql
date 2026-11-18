CREATE OR REPLACE FUNCTION public.transfer_group(_group_id uuid, _class_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _idea uuid;
BEGIN
  IF NOT public.teaches_group(_group_id) OR NOT public.teaches_class(_class_id) THEN
    RAISE EXCEPTION 'Você só pode mover grupos entre as suas turmas.';
  END IF;
  SELECT idea_id INTO _idea FROM public.projects WHERE group_id = _group_id;
  IF _idea IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.projects p JOIN public.groups g ON g.id = p.group_id
    WHERE g.class_id = _class_id AND p.idea_id = _idea AND g.id <> _group_id) THEN
    RAISE EXCEPTION 'Outro grupo da turma de destino já usa a mesma ideia do Banco de Inspirações.';
  END IF;
  UPDATE public.groups SET class_id = _class_id WHERE id = _group_id;
  UPDATE public.group_members SET class_id = _class_id WHERE group_id = _group_id;
END $$;
REVOKE ALL ON FUNCTION public.transfer_group(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_group(uuid, uuid) TO authenticated;