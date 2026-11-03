CREATE TABLE public.fair_approvals (
  group_id uuid PRIMARY KEY REFERENCES public.groups(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'aprovado' CHECK (status IN ('aprovado','ajustes','recusado')),
  note text,
  docs_due_at timestamptz,
  teacher_id uuid,
  decided_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fair_approvals TO authenticated;
GRANT ALL ON public.fair_approvals TO service_role;
ALTER TABLE public.fair_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teacher manages approvals" ON public.fair_approvals FOR ALL TO authenticated
  USING (public.teaches_group(group_id)) WITH CHECK (public.teaches_group(group_id));
CREATE POLICY "members read approval" ON public.fair_approvals FOR SELECT TO authenticated
  USING (public.is_group_member(group_id));

CREATE OR REPLACE FUNCTION public.fair_approved(_group_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.fair_approvals WHERE group_id = _group_id AND status = 'aprovado')
$$;

CREATE TABLE public.fair_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  doc_type text NOT NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'enviado' CHECK (status IN ('enviado','conferido','refazer')),
  teacher_note text,
  UNIQUE (group_id, doc_type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fair_documents TO authenticated;
GRANT ALL ON public.fair_documents TO service_role;
ALTER TABLE public.fair_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teacher reviews docs" ON public.fair_documents FOR ALL TO authenticated
  USING (public.teaches_group(group_id)) WITH CHECK (public.teaches_group(group_id));
CREATE POLICY "members read docs" ON public.fair_documents FOR SELECT TO authenticated
  USING (public.is_group_member(group_id));
CREATE POLICY "members add docs" ON public.fair_documents FOR INSERT TO authenticated
  WITH CHECK (public.is_group_member(group_id) AND public.fair_approved(group_id) AND status = 'enviado' AND uploaded_by = auth.uid());
CREATE POLICY "members replace docs" ON public.fair_documents FOR UPDATE TO authenticated
  USING (public.is_group_member(group_id) AND public.fair_approved(group_id) AND status <> 'conferido')
  WITH CHECK (public.is_group_member(group_id) AND status = 'enviado' AND uploaded_by = auth.uid());

CREATE POLICY "fair docs member upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fair-docs' AND public.is_group_member(((storage.foldername(name))[1])::uuid) AND public.fair_approved(((storage.foldername(name))[1])::uuid));
CREATE POLICY "fair docs read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'fair-docs' AND (public.is_group_member(((storage.foldername(name))[1])::uuid) OR public.teaches_group(((storage.foldername(name))[1])::uuid)));