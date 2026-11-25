CREATE OR REPLACE FUNCTION public.can_join_group_topic(_topic text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT _topic LIKE 'group-live:%'
    AND substring(_topic from 12) ~ '^[0-9a-f-]{36}$'
    AND public.is_group_member(substring(_topic from 12)::uuid)
$$;
GRANT EXECUTE ON FUNCTION public.can_join_group_topic(text) TO authenticated;
CREATE POLICY "group members read live topic" ON realtime.messages FOR SELECT TO authenticated
  USING (public.can_join_group_topic(realtime.topic()));
CREATE POLICY "group members write live topic" ON realtime.messages FOR INSERT TO authenticated
  WITH CHECK (public.can_join_group_topic(realtime.topic()));