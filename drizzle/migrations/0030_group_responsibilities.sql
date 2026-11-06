CREATE TABLE public.group_responsibilities (
 group_id uuid PRIMARY KEY REFERENCES public.groups(id) ON DELETE CASCADE,
 leader_student_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 diary_student_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.group_responsibilities TO authenticated;
GRANT ALL ON public.group_responsibilities TO service_role;
ALTER TABLE public.group_responsibilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members and owning teacher read responsibilities" ON public.group_responsibilities FOR SELECT TO authenticated USING (public.is_group_member(group_id) OR public.teaches_group(group_id));
CREATE POLICY "Members choose responsibilities" ON public.group_responsibilities FOR INSERT TO authenticated WITH CHECK (public.is_group_member(group_id));
CREATE POLICY "Members change responsibilities" ON public.group_responsibilities FOR UPDATE TO authenticated USING (public.is_group_member(group_id)) WITH CHECK (public.is_group_member(group_id));
CREATE FUNCTION public.validate_group_responsibilities() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF TG_OP = 'UPDATE' AND NEW.group_id IS DISTINCT FROM OLD.group_id THEN RAISE EXCEPTION 'O grupo não pode ser alterado.'; END IF;
 PERFORM 1 FROM public.groups WHERE id = NEW.group_id FOR UPDATE;
 IF NEW.leader_student_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.group_members WHERE group_id = NEW.group_id AND student_id = NEW.leader_student_id) THEN RAISE EXCEPTION 'O líder deve ser integrante do grupo.'; END IF;
 IF NEW.diary_student_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.group_members WHERE group_id = NEW.group_id AND student_id = NEW.diary_student_id) THEN RAISE EXCEPTION 'O responsável pelo diário deve ser integrante do grupo.'; END IF;
 NEW.updated_at := now(); RETURN NEW;
END; $$;
CREATE TRIGGER validate_group_responsibilities BEFORE INSERT OR UPDATE ON public.group_responsibilities FOR EACH ROW EXECUTE FUNCTION public.validate_group_responsibilities();
CREATE FUNCTION public.clear_departed_group_responsibilities() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 UPDATE public.group_responsibilities SET leader_student_id = CASE WHEN leader_student_id = OLD.student_id THEN NULL ELSE leader_student_id END, diary_student_id = CASE WHEN diary_student_id = OLD.student_id THEN NULL ELSE diary_student_id END WHERE group_id = OLD.group_id AND (leader_student_id = OLD.student_id OR diary_student_id = OLD.student_id);
 RETURN OLD;
END; $$;
CREATE TRIGGER clear_departed_group_responsibilities AFTER DELETE ON public.group_members FOR EACH ROW EXECUTE FUNCTION public.clear_departed_group_responsibilities();