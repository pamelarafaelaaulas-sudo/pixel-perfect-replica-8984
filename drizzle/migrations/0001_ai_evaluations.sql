CREATE TABLE public.ai_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  phase_number integer NOT NULL CHECK (phase_number BETWEEN 1 AND 4),
  requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  overall numeric NOT NULL,
  criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text NOT NULL DEFAULT '',
  tips jsonb NOT NULL DEFAULT '{}'::jsonb,
  evaluated_text text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_evaluations_group_phase_idx ON public.ai_evaluations (group_id, phase_number, created_at DESC);

GRANT SELECT ON public.ai_evaluations TO authenticated;
GRANT ALL ON public.ai_evaluations TO service_role;

ALTER TABLE public.ai_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teacher reads AI evaluations" ON public.ai_evaluations
  FOR SELECT TO authenticated USING (public.is_teacher());

CREATE POLICY "Members read own group AI evaluations" ON public.ai_evaluations
  FOR SELECT TO authenticated USING (public.is_group_member(group_id));
