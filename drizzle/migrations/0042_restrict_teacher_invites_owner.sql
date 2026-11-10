CREATE OR REPLACE FUNCTION public.is_invite_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_teacher() AND EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND lower(email) = 'pamelarafaelaaulas@gmail.com')
$$;
DROP POLICY IF EXISTS "Teacher creates invites" ON public.teacher_invites;
DROP POLICY IF EXISTS "Teacher deletes own unused invites" ON public.teacher_invites;
CREATE POLICY "Owner creates invites" ON public.teacher_invites FOR INSERT TO authenticated
  WITH CHECK (public.is_invite_admin() AND created_by = auth.uid() AND used_by IS NULL AND used_at IS NULL AND used_by_name IS NULL);
CREATE POLICY "Owner deletes own unused invites" ON public.teacher_invites FOR DELETE TO authenticated
  USING (public.is_invite_admin() AND created_by = auth.uid() AND used_by IS NULL);