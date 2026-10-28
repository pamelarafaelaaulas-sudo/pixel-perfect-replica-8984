-- Allow more than one teacher
DROP INDEX IF EXISTS public.user_roles_single_teacher;

-- ===== Ownership helpers: a teacher only reaches her own classes =====
CREATE OR REPLACE FUNCTION public.teaches_class(_class_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_teacher() AND EXISTS (
    SELECT 1 FROM public.classes WHERE id = _class_id AND teacher_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.teaches_group(_group_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_teacher() AND EXISTS (
    SELECT 1 FROM public.groups g JOIN public.classes c ON c.id = g.class_id
    WHERE g.id = _group_id AND c.teacher_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.teaches_student(_student_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_teacher() AND EXISTS (
    SELECT 1 FROM public.group_members gm JOIN public.classes c ON c.id = gm.class_id
    WHERE gm.student_id = _student_id AND c.teacher_id = auth.uid()
  )
$$;

-- ===== Re-scope teacher policies to own classes =====
DROP POLICY IF EXISTS "Read own profile, groupmates, or as teacher" ON public.profiles;
CREATE POLICY "Read own profile, groupmates, or own students" ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid() OR public.teaches_student(id) OR public.shares_group_with(id));

DROP POLICY IF EXISTS "Teacher manages schedules" ON public.schedules;
CREATE POLICY "Teacher manages own class schedules" ON public.schedules
  FOR ALL TO authenticated USING (public.teaches_class(class_id)) WITH CHECK (public.teaches_class(class_id));

DROP POLICY IF EXISTS "Teacher manages groups" ON public.groups;
CREATE POLICY "Teacher manages own class groups" ON public.groups
  FOR ALL TO authenticated USING (public.teaches_class(class_id)) WITH CHECK (public.teaches_class(class_id));

DROP POLICY IF EXISTS "Teacher manages members" ON public.group_members;
CREATE POLICY "Teacher manages own class members" ON public.group_members
  FOR ALL TO authenticated USING (public.teaches_class(class_id))
  WITH CHECK (public.teaches_class(class_id) AND public.teaches_group(group_id));

DROP POLICY IF EXISTS "Teacher manages projects" ON public.projects;
CREATE POLICY "Teacher manages own class projects" ON public.projects
  FOR ALL TO authenticated USING (public.teaches_group(group_id)) WITH CHECK (public.teaches_group(group_id));

DROP POLICY IF EXISTS "Teacher manages submissions" ON public.phase_submissions;
CREATE POLICY "Teacher manages own class submissions" ON public.phase_submissions
  FOR ALL TO authenticated USING (public.teaches_group(public.project_group(project_id)))
  WITH CHECK (public.teaches_group(public.project_group(project_id)));

DROP POLICY IF EXISTS "Teacher reads contributions" ON public.project_contributions;
CREATE POLICY "Teacher reads own class contributions" ON public.project_contributions
  FOR SELECT TO authenticated USING (public.teaches_group(public.project_group(project_id)));

DROP POLICY IF EXISTS "Teacher reads peer evaluations" ON public.peer_evaluations;
CREATE POLICY "Teacher reads own class peer evaluations" ON public.peer_evaluations
  FOR SELECT TO authenticated USING (public.teaches_group(group_id));

DROP POLICY IF EXISTS "Teacher manages grades" ON public.grades;
CREATE POLICY "Teacher manages own class grades" ON public.grades
  FOR ALL TO authenticated USING (public.teaches_group(group_id)) WITH CHECK (public.teaches_group(group_id));

DROP POLICY IF EXISTS "Teacher reads AI evaluations" ON public.ai_evaluations;
CREATE POLICY "Teacher reads own class AI evaluations" ON public.ai_evaluations
  FOR SELECT TO authenticated USING (public.teaches_group(group_id));

-- Only the group's own teacher may move a project's phase directly
CREATE OR REPLACE FUNCTION public.guard_project_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.current_phase IS DISTINCT FROM OLD.current_phase
     AND NOT public.teaches_group(OLD.group_id)
     AND current_setting('app.phase_advance', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Somente a professora pode mudar a etapa diretamente';
  END IF;
  IF NEW.group_id IS DISTINCT FROM OLD.group_id THEN
    RAISE EXCEPTION 'O grupo do projeto não pode ser alterado';
  END IF;
  RETURN NEW;
END;
$$;

-- ===== Teacher invite codes =====
CREATE TABLE public.teacher_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL DEFAULT upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)),
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  used_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  used_by_name TEXT,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.teacher_invites TO authenticated;
GRANT ALL ON public.teacher_invites TO service_role;
ALTER TABLE public.teacher_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teacher reads own invites" ON public.teacher_invites
  FOR SELECT TO authenticated USING (public.is_teacher() AND created_by = auth.uid());
CREATE POLICY "Teacher creates invites" ON public.teacher_invites
  FOR INSERT TO authenticated WITH CHECK (public.is_teacher() AND created_by = auth.uid() AND used_by IS NULL AND used_at IS NULL AND used_by_name IS NULL);
CREATE POLICY "Teacher deletes own unused invites" ON public.teacher_invites
  FOR DELETE TO authenticated USING (public.is_teacher() AND created_by = auth.uid() AND used_by IS NULL);

-- Consumes an invite and turns the user into a teacher. Internal helper.
CREATE OR REPLACE FUNCTION public.consume_teacher_invite(_user_id UUID, _code TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _invite_id UUID;
BEGIN
  SELECT id INTO _invite_id FROM public.teacher_invites
  WHERE code = upper(trim(_code)) AND used_by IS NULL
  FOR UPDATE;
  IF _invite_id IS NULL THEN RETURN FALSE; END IF;
  UPDATE public.teacher_invites
    SET used_by = _user_id, used_at = now(),
        used_by_name = (SELECT name FROM public.profiles WHERE id = _user_id)
    WHERE id = _invite_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, 'teacher') ON CONFLICT DO NOTHING;
  DELETE FROM public.user_roles WHERE user_id = _user_id AND role = 'student';
  RETURN TRUE;
END;
$$;

-- Signup: an invite code in the signup form makes the account a teacher
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _invite TEXT := NULLIF(trim(NEW.raw_user_meta_data->>'teacher_invite'), '');
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'name', ''), NULLIF(NEW.raw_user_meta_data->>'full_name', ''), split_part(NEW.email, '@', 1)),
    COALESCE(NEW.email, '')
  )
  ON CONFLICT (id) DO NOTHING;

  IF _invite IS NOT NULL THEN
    IF NOT public.consume_teacher_invite(NEW.id, _invite) THEN
      RAISE EXCEPTION 'TEACHER_INVITE_INVALID';
    END IF;
    RETURN NEW;
  END IF;

  -- The very first account ever becomes a teacher; everyone else is a student
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'teacher') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'teacher') ON CONFLICT DO NOTHING;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.id) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'student') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Signed-in student (e.g. Google sign-in) redeems an invite
CREATE OR REPLACE FUNCTION public.redeem_teacher_invite(_code TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre na sua conta primeiro'; END IF;
  IF public.is_teacher() THEN RAISE EXCEPTION 'Sua conta já é de professora'; END IF;
  IF EXISTS (SELECT 1 FROM public.group_members WHERE student_id = auth.uid()) THEN
    RAISE EXCEPTION 'Esta conta já participa de grupos como aluno. Use outra conta para ser professora.';
  END IF;
  IF NOT public.consume_teacher_invite(auth.uid(), _code) THEN
    RAISE EXCEPTION 'Código de professora inválido ou já usado';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_teacher_invite(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.redeem_teacher_invite(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_teacher_invite(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.teaches_class(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.teaches_group(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.teaches_student(UUID) TO authenticated;
