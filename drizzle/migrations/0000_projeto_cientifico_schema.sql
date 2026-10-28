-- ===== Roles & profiles =====
CREATE TYPE public.app_role AS ENUM ('teacher', 'student');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  whatsapp TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
-- Only one teacher can ever exist
CREATE UNIQUE INDEX user_roles_single_teacher ON public.user_roles (role) WHERE role = 'teacher';
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_teacher()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'teacher')
$$;

CREATE POLICY "Users read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ===== Classes, schedules, groups =====
CREATE TABLE public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  class_code TEXT UNIQUE NOT NULL DEFAULT upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6)),
  late_penalty_per_day NUMERIC NOT NULL DEFAULT 0.5 CHECK (late_penalty_per_day >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classes TO authenticated;
GRANT ALL ON public.classes TO service_role;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE NOT NULL,
  phase_number INT NOT NULL CHECK (phase_number BETWEEN 1 AND 4),
  phase_name TEXT NOT NULL,
  due_date TIMESTAMPTZ NOT NULL,
  UNIQUE (class_id, phase_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedules TO authenticated;
GRANT ALL ON public.schedules TO service_role;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE NOT NULL,
  group_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.groups TO authenticated;
GRANT ALL ON public.groups TO service_role;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE NOT NULL,
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE NOT NULL,
  student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  whatsapp TEXT NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, student_id),
  UNIQUE (class_id, student_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_members TO authenticated;
GRANT ALL ON public.group_members TO service_role;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

-- ===== Projects =====
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE NOT NULL UNIQUE,
  current_phase INT NOT NULL DEFAULT 1 CHECK (current_phase BETWEEN 1 AND 4),
  theme TEXT,
  scientific_articles JSONB NOT NULL DEFAULT '[]'::jsonb,
  guiding_question TEXT,
  title TEXT,
  general_objective TEXT,
  specific_objectives TEXT,
  methodology TEXT,
  introduction TEXT,
  results_discussion TEXT,
  references_list TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.phase_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  phase_number INT NOT NULL CHECK (phase_number BETWEEN 1 AND 4),
  submitted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, phase_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.phase_submissions TO authenticated;
GRANT ALL ON public.phase_submissions TO service_role;
ALTER TABLE public.phase_submissions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.project_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  section_name TEXT NOT NULL,
  char_count_added INT NOT NULL DEFAULT 0,
  edited_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.project_contributions TO authenticated;
GRANT ALL ON public.project_contributions TO service_role;
ALTER TABLE public.project_contributions ENABLE ROW LEVEL SECURITY;

-- ===== Evaluations & grades =====
CREATE TABLE public.peer_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE NOT NULL,
  evaluator_student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  evaluated_student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  trimester INT NOT NULL CHECK (trimester BETWEEN 1 AND 3),
  score NUMERIC NOT NULL CHECK (score BETWEEN 1 AND 5),
  feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (evaluator_student_id, evaluated_student_id, trimester),
  CHECK (evaluator_student_id <> evaluated_student_id)
);
GRANT SELECT, INSERT, UPDATE ON public.peer_evaluations TO authenticated;
GRANT ALL ON public.peer_evaluations TO service_role;
ALTER TABLE public.peer_evaluations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE NOT NULL,
  trimester INT NOT NULL CHECK (trimester BETWEEN 1 AND 3),
  score NUMERIC NOT NULL CHECK (score BETWEEN 0 AND 10),
  feedback TEXT,
  is_reference_ten BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, trimester)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grades TO authenticated;
GRANT ALL ON public.grades TO service_role;
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;

-- ===== Helper functions (security definer, avoid RLS recursion) =====
CREATE OR REPLACE FUNCTION public.is_group_member(_group_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.group_members WHERE group_id = _group_id AND student_id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.is_class_student(_class_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.group_members WHERE class_id = _class_id AND student_id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.project_group(_project_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT group_id FROM public.projects WHERE id = _project_id
$$;

CREATE OR REPLACE FUNCTION public.shares_group_with(_other UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members a
    JOIN public.group_members b ON a.group_id = b.group_id
    WHERE a.student_id = auth.uid() AND b.student_id = _other
  )
$$;

-- ===== Policies =====
CREATE POLICY "Read own profile, groupmates, or as teacher" ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_teacher() OR public.shares_group_with(id));
CREATE POLICY "Insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "Update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "Teacher manages own classes" ON public.classes
  FOR ALL TO authenticated USING (public.is_teacher() AND teacher_id = auth.uid())
  WITH CHECK (public.is_teacher() AND teacher_id = auth.uid());
CREATE POLICY "Students read their classes" ON public.classes
  FOR SELECT TO authenticated USING (public.is_class_student(id));

CREATE POLICY "Teacher manages schedules" ON public.schedules
  FOR ALL TO authenticated USING (public.is_teacher()) WITH CHECK (public.is_teacher());
CREATE POLICY "Students read class schedules" ON public.schedules
  FOR SELECT TO authenticated USING (public.is_class_student(class_id));

CREATE POLICY "Teacher manages groups" ON public.groups
  FOR ALL TO authenticated USING (public.is_teacher()) WITH CHECK (public.is_teacher());
CREATE POLICY "Members read own group" ON public.groups
  FOR SELECT TO authenticated USING (public.is_group_member(id));
CREATE POLICY "Members rename own group" ON public.groups
  FOR UPDATE TO authenticated USING (public.is_group_member(id)) WITH CHECK (public.is_group_member(id));

CREATE POLICY "Teacher manages members" ON public.group_members
  FOR ALL TO authenticated USING (public.is_teacher()) WITH CHECK (public.is_teacher());
CREATE POLICY "Members read groupmates" ON public.group_members
  FOR SELECT TO authenticated USING (public.is_group_member(group_id));
CREATE POLICY "Members update own whatsapp" ON public.group_members
  FOR UPDATE TO authenticated USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());

CREATE POLICY "Teacher manages projects" ON public.projects
  FOR ALL TO authenticated USING (public.is_teacher()) WITH CHECK (public.is_teacher());
CREATE POLICY "Members read project" ON public.projects
  FOR SELECT TO authenticated USING (public.is_group_member(group_id));
CREATE POLICY "Members edit project" ON public.projects
  FOR UPDATE TO authenticated USING (public.is_group_member(group_id)) WITH CHECK (public.is_group_member(group_id));

CREATE POLICY "Teacher manages submissions" ON public.phase_submissions
  FOR ALL TO authenticated USING (public.is_teacher()) WITH CHECK (public.is_teacher());
CREATE POLICY "Members read submissions" ON public.phase_submissions
  FOR SELECT TO authenticated USING (public.is_group_member(public.project_group(project_id)));

CREATE POLICY "Teacher reads contributions" ON public.project_contributions
  FOR SELECT TO authenticated USING (public.is_teacher());
CREATE POLICY "Members read group contributions" ON public.project_contributions
  FOR SELECT TO authenticated USING (public.is_group_member(public.project_group(project_id)));
CREATE POLICY "Members log own contributions" ON public.project_contributions
  FOR INSERT TO authenticated WITH CHECK (student_id = auth.uid() AND public.is_group_member(public.project_group(project_id)));

CREATE POLICY "Teacher reads peer evaluations" ON public.peer_evaluations
  FOR SELECT TO authenticated USING (public.is_teacher());
CREATE POLICY "Evaluator reads own evaluations" ON public.peer_evaluations
  FOR SELECT TO authenticated USING (evaluator_student_id = auth.uid());
CREATE POLICY "Evaluator writes evaluations of groupmates" ON public.peer_evaluations
  FOR INSERT TO authenticated WITH CHECK (
    evaluator_student_id = auth.uid()
    AND public.is_group_member(group_id)
    AND EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = peer_evaluations.group_id AND gm.student_id = evaluated_student_id)
  );
CREATE POLICY "Evaluator updates own evaluations" ON public.peer_evaluations
  FOR UPDATE TO authenticated USING (evaluator_student_id = auth.uid())
  WITH CHECK (
    evaluator_student_id = auth.uid()
    AND public.is_group_member(group_id)
    AND EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = peer_evaluations.group_id AND gm.student_id = evaluated_student_id)
  );

CREATE POLICY "Teacher manages grades" ON public.grades
  FOR ALL TO authenticated USING (public.is_teacher()) WITH CHECK (public.is_teacher());
CREATE POLICY "Members read own grades" ON public.grades
  FOR SELECT TO authenticated USING (public.is_group_member(group_id));

-- ===== Triggers =====
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'name', ''), NULLIF(NEW.raw_user_meta_data->>'full_name', ''), split_part(NEW.email, '@', 1)),
    COALESCE(NEW.email, '')
  )
  ON CONFLICT (id) DO NOTHING;

  -- The very first account becomes the (single) teacher; everyone else is a student
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'teacher') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'teacher') ON CONFLICT DO NOTHING;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.id) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'student') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.create_default_schedules()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.schedules (class_id, phase_number, phase_name, due_date) VALUES
    (NEW.id, 1, 'Tema', date_trunc('day', now()) + interval '14 days 23 hours 59 minutes'),
    (NEW.id, 2, 'Artigos científicos', date_trunc('day', now()) + interval '28 days 23 hours 59 minutes'),
    (NEW.id, 3, 'Pergunta norteadora', date_trunc('day', now()) + interval '42 days 23 hours 59 minutes'),
    (NEW.id, 4, 'Projeto escrito', date_trunc('day', now()) + interval '70 days 23 hours 59 minutes');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_class_created
  AFTER INSERT ON public.classes
  FOR EACH ROW EXECUTE FUNCTION public.create_default_schedules();

CREATE OR REPLACE FUNCTION public.guard_project_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.current_phase IS DISTINCT FROM OLD.current_phase
     AND NOT public.is_teacher()
     AND current_setting('app.phase_advance', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Somente a professora pode mudar a etapa diretamente';
  END IF;
  IF NEW.group_id IS DISTINCT FROM OLD.group_id THEN
    RAISE EXCEPTION 'O grupo do projeto não pode ser alterado';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_project_update
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.guard_project_update();

-- ===== RPCs for students =====
CREATE OR REPLACE FUNCTION public.find_class(_code TEXT)
RETURNS TABLE (id UUID, name TEXT, teacher_name TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.name, p.name
  FROM public.classes c JOIN public.profiles p ON p.id = c.teacher_id
  WHERE auth.uid() IS NOT NULL AND c.class_code = upper(trim(_code))
$$;

CREATE OR REPLACE FUNCTION public.list_class_groups(_code TEXT)
RETURNS TABLE (group_id UUID, group_name TEXT, member_count INT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT g.id, g.group_name, (SELECT count(*)::int FROM public.group_members gm WHERE gm.group_id = g.id)
  FROM public.groups g JOIN public.classes c ON c.id = g.class_id
  WHERE auth.uid() IS NOT NULL AND c.class_code = upper(trim(_code))
  ORDER BY g.created_at
$$;

CREATE OR REPLACE FUNCTION public.create_group(_code TEXT, _group_name TEXT, _whatsapp TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _class_id UUID;
  _group_id UUID;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'student') THEN
    RAISE EXCEPTION 'Apenas alunos podem criar grupos';
  END IF;
  IF coalesce(trim(_group_name), '') = '' OR coalesce(trim(_whatsapp), '') = '' THEN
    RAISE EXCEPTION 'Informe o nome do grupo e seu WhatsApp';
  END IF;
  SELECT id INTO _class_id FROM public.classes WHERE class_code = upper(trim(_code));
  IF _class_id IS NULL THEN RAISE EXCEPTION 'Turma não encontrada'; END IF;
  IF EXISTS (SELECT 1 FROM public.group_members WHERE class_id = _class_id AND student_id = auth.uid()) THEN
    RAISE EXCEPTION 'Você já faz parte de um grupo nesta turma';
  END IF;
  INSERT INTO public.groups (class_id, group_name) VALUES (_class_id, trim(_group_name)) RETURNING id INTO _group_id;
  INSERT INTO public.group_members (group_id, class_id, student_id, whatsapp) VALUES (_group_id, _class_id, auth.uid(), trim(_whatsapp));
  INSERT INTO public.projects (group_id) VALUES (_group_id);
  UPDATE public.profiles SET whatsapp = trim(_whatsapp) WHERE id = auth.uid();
  RETURN _group_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_group(_group_id UUID, _whatsapp TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _class_id UUID;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'student') THEN
    RAISE EXCEPTION 'Apenas alunos podem entrar em grupos';
  END IF;
  IF coalesce(trim(_whatsapp), '') = '' THEN RAISE EXCEPTION 'Informe seu WhatsApp'; END IF;
  SELECT class_id INTO _class_id FROM public.groups WHERE id = _group_id FOR UPDATE;
  IF _class_id IS NULL THEN RAISE EXCEPTION 'Grupo não encontrado'; END IF;
  IF EXISTS (SELECT 1 FROM public.group_members WHERE class_id = _class_id AND student_id = auth.uid()) THEN
    RAISE EXCEPTION 'Você já faz parte de um grupo nesta turma';
  END IF;
  IF (SELECT count(*) FROM public.group_members WHERE group_id = _group_id) >= 3 THEN
    RAISE EXCEPTION 'Este grupo já tem 3 integrantes';
  END IF;
  INSERT INTO public.group_members (group_id, class_id, student_id, whatsapp) VALUES (_group_id, _class_id, auth.uid(), trim(_whatsapp));
  UPDATE public.profiles SET whatsapp = trim(_whatsapp) WHERE id = auth.uid();
  RETURN _group_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_phase(_project_id UUID)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _group_id UUID;
  _phase INT;
BEGIN
  SELECT group_id, current_phase INTO _group_id, _phase FROM public.projects WHERE id = _project_id FOR UPDATE;
  IF _group_id IS NULL OR NOT public.is_group_member(_group_id) THEN
    RAISE EXCEPTION 'Você não faz parte deste grupo';
  END IF;
  IF EXISTS (SELECT 1 FROM public.phase_submissions WHERE project_id = _project_id AND phase_number = _phase) THEN
    RAISE EXCEPTION 'Esta etapa já foi entregue';
  END IF;
  INSERT INTO public.phase_submissions (project_id, phase_number, submitted_by) VALUES (_project_id, _phase, auth.uid());
  IF _phase < 4 THEN
    PERFORM set_config('app.phase_advance', 'on', true);
    UPDATE public.projects SET current_phase = _phase + 1 WHERE id = _project_id;
    PERFORM set_config('app.phase_advance', 'off', true);
  END IF;
  RETURN _phase;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_default_schedules() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.find_class(TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_class_groups(TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_group(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.join_group(UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.submit_phase(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_class(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_class_groups(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_group(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_group(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_phase(UUID) TO authenticated;
