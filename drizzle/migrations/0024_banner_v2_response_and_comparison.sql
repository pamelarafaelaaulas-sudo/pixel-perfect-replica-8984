-- The group's written answer to the teacher's feedback, sent together with the new version.
ALTER TABLE public.banner_reviews ADD COLUMN student_response TEXT;

-- New version + mandatory written answer; identical files are still refused.
CREATE OR REPLACE FUNCTION public.resubmit_banner(_review_id UUID, _path TEXT, _name TEXT, _hash TEXT, _response TEXT)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _r public.banner_reviews;
  _p public.projects;
  _now TIMESTAMPTZ := now();
BEGIN
  SELECT * INTO _r FROM public.banner_reviews WHERE id = _review_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_group_member(_r.group_id) THEN
    RAISE EXCEPTION 'Devolutiva não encontrada';
  END IF;
  IF _r.resubmitted_at IS NOT NULL THEN
    RAISE EXCEPTION 'A nova versão já foi enviada para esta devolutiva';
  END IF;
  IF length(btrim(coalesce(_response, ''))) < 20 THEN
    RAISE EXCEPTION 'Escreva o que vocês mudaram nesta versão (pelo menos 20 caracteres).';
  END IF;
  IF coalesce(_path, '') = '' OR split_part(_path, '/', 1) <> _r.group_id::text OR position('/review-' in _path) > 0 THEN
    RAISE EXCEPTION 'Arquivo inválido';
  END IF;
  IF coalesce(_hash, '') = '' THEN
    RAISE EXCEPTION 'Arquivo inválido';
  END IF;
  SELECT * INTO _p FROM public.projects WHERE id = _r.project_id;
  IF _p.banner_file_hash IS NOT NULL AND _p.banner_file_hash = _hash THEN
    RAISE EXCEPTION 'Este arquivo é idêntico à versão anterior. Faça as correções pedidas antes de reenviar.';
  END IF;
  PERFORM set_config('app.banner_resubmit', 'on', true);
  UPDATE public.projects
    SET banner_file_path = _path, banner_file_name = _name, banner_file_hash = _hash
    WHERE id = _r.project_id;
  PERFORM set_config('app.banner_resubmit', 'off', true);
  UPDATE public.banner_reviews
    SET resubmitted_at = _now, resubmitted_file_path = _path, resubmitted_file_name = _name,
        resubmitted_by = auth.uid(), student_response = btrim(_response)
    WHERE id = _review_id;
  RETURN _now;
END;
$$;
REVOKE ALL ON FUNCTION public.resubmit_banner(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resubmit_banner(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
COMMENT ON FUNCTION public.resubmit_banner(UUID, TEXT, TEXT, TEXT) IS 'DEPRECATED: replaced by resubmit_banner(..., _response) which requires the group''s written answer';

-- AI comparison of version N and N+1 for one feedback round. Teacher-only reading; written by the server.
CREATE TABLE public.banner_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL UNIQUE REFERENCES public.banner_reviews(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  change_percent INTEGER NOT NULL DEFAULT 0,
  summary TEXT NOT NULL DEFAULT '',
  changed JSONB NOT NULL DEFAULT '[]'::jsonb,
  addressed JSONB NOT NULL DEFAULT '[]'::jsonb,
  pending JSONB NOT NULL DEFAULT '[]'::jsonb,
  response_matches BOOLEAN,
  response_note TEXT NOT NULL DEFAULT '',
  requested_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX banner_comparisons_group_idx ON public.banner_comparisons (group_id);

GRANT SELECT ON public.banner_comparisons TO authenticated;
GRANT ALL ON public.banner_comparisons TO service_role;
ALTER TABLE public.banner_comparisons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teacher reads own group banner comparisons" ON public.banner_comparisons
  FOR SELECT TO authenticated
  USING (public.teaches_group(group_id));