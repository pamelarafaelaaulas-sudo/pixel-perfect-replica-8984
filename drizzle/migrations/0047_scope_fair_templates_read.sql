DROP POLICY IF EXISTS "read fair templates" ON storage.objects;
CREATE POLICY "read fair templates" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'fair-docs'
  AND (storage.foldername(name))[1] = 'templates'
  AND (
    (storage.foldername(name))[2] = (auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.classes c
      WHERE c.teacher_id::text = (storage.foldername(name))[2]
        AND public.is_class_student(c.id)
    )
  )
);