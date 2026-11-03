CREATE TABLE public.fair_doc_templates (
  teacher_id uuid NOT NULL,
  doc_type text NOT NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (teacher_id, doc_type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fair_doc_templates TO authenticated;
GRANT ALL ON public.fair_doc_templates TO service_role;
ALTER TABLE public.fair_doc_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teacher manages own templates" ON public.fair_doc_templates FOR ALL TO authenticated
  USING (teacher_id = auth.uid() AND public.is_teacher())
  WITH CHECK (teacher_id = auth.uid() AND public.is_teacher());
CREATE POLICY "students read their teachers templates" ON public.fair_doc_templates FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.classes c WHERE c.teacher_id = fair_doc_templates.teacher_id AND public.is_class_student(c.id)));

CREATE POLICY "teacher writes fair templates" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fair-docs' AND (storage.foldername(name))[1] = 'templates' AND (storage.foldername(name))[2] = auth.uid()::text AND public.is_teacher());
CREATE POLICY "teacher updates fair templates" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'fair-docs' AND (storage.foldername(name))[1] = 'templates' AND (storage.foldername(name))[2] = auth.uid()::text AND public.is_teacher());
CREATE POLICY "teacher deletes fair templates" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'fair-docs' AND (storage.foldername(name))[1] = 'templates' AND (storage.foldername(name))[2] = auth.uid()::text AND public.is_teacher());
CREATE POLICY "read fair templates" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'fair-docs' AND (storage.foldername(name))[1] = 'templates');