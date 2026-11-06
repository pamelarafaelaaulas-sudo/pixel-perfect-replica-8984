CREATE TABLE public.fair_attendees (
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  cpf text NOT NULL,
  birth_date date,
  shirt_size text NOT NULL,
  whatsapp text,
  guardian_name text,
  guardian_phone text,
  dietary text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, student_id),
  CONSTRAINT fair_attendees_shirt CHECK (shirt_size IN ('PP','P','M','G','GG','XGG')),
  CONSTRAINT fair_attendees_cpf CHECK (cpf ~ '^\d{11}$'),
  CONSTRAINT fair_attendees_len CHECK (length(full_name) BETWEEN 3 AND 150 AND coalesce(length(dietary),0) <= 300 AND coalesce(length(guardian_name),0) <= 150)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fair_attendees TO authenticated;
GRANT ALL ON public.fair_attendees TO service_role;
ALTER TABLE public.fair_attendees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage attendees" ON public.fair_attendees FOR ALL TO authenticated
  USING (public.is_group_member(group_id))
  WITH CHECK (public.is_group_member(group_id) AND EXISTS (SELECT 1 FROM public.group_members m WHERE m.group_id = fair_attendees.group_id AND m.student_id = fair_attendees.student_id));
CREATE POLICY "teacher reads attendees" ON public.fair_attendees FOR SELECT TO authenticated
  USING (public.teaches_group(group_id));