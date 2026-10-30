-- Banner corrector: file fingerprint, teacher feedback rounds (V1 -> V2) and AI diagnoses.
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS banner_file_hash TEXT;

-- One row per teacher feedback round on the banner; the group answers it with a new version.
CREATE TABLE public.banner_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  round INTEGER NOT NULL DEFAULT 1,
  teacher_id UUID,
  reviewed_file_path TEXT,
  reviewed_file_name TEXT,
  notes TEXT NOT NULL DEFAULT '',
  annotated_file_path TEXT,
  annotated_file_name TEXT,
  resubmit_due_at TIMESTAMPTZ NOT NULL,
  resubmitted_at TIMESTAMPTZ,
  resubmitted_file_path TEXT,
  resubmitted_file_name TEXT,
  resubmitted_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX banner_reviews_one_open_per_project ON public.banner_reviews (project_id) WHERE resubmitted_at IS NULL;
CREATE INDEX banner_reviews_group_idx ON public.banner_reviews (group_id, round);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.banner_reviews TO authenticated;
GRANT ALL ON public.banner_reviews TO service_role;
ALTER TABLE public.banner_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teacher manages own group banner reviews" ON public.banner_reviews
  FOR ALL TO authenticated
  USING (public.teaches_group(group_id))
  WITH CHECK (public.teaches_group(group_id));
CREATE POLICY "Members read own group banner reviews" ON public.banner_reviews
  FOR SELECT TO authenticated
  USING (public.is_group_member(group_id));

-- New round: numbered automatically, tied to the file being reviewed and to the teacher who wrote it.
CREATE OR REPLACE FUNCTION public.prepare_banner_review()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _p public.projects;
BEGIN
  SELECT * INTO _p FROM public.projects WHERE id = NEW.project_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Projeto não encontrado'; END IF;
  NEW.group_id := _p.group_id;
  NEW.teacher_id := auth.uid();
  NEW.reviewed_file_path := _p.banner_file_path;
  NEW.reviewed_file_name := _p.banner_file_name;
  NEW.resubmitted_at := NULL;
  NEW.resubmitted_file_path := NULL;
  NEW.resubmitted_file_name := NULL;
  NEW.resubmitted_by := NULL;
  SELECT coalesce(max(r.round), 0) + 1 INTO NEW.round FROM public.banner_reviews r WHERE r.project_id = NEW.project_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER banner_reviews_prepare BEFORE INSERT ON public.banner_reviews
  FOR EACH ROW EXECUTE FUNCTION public.prepare_banner_review();

CREATE OR REPLACE FUNCTION public.touch_banner_review()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  NEW.round := OLD.round;
  NEW.project_id := OLD.project_id;
  NEW.group_id := OLD.group_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER banner_reviews_touch BEFORE UPDATE ON public.banner_reviews
  FOR EACH ROW EXECUTE FUNCTION public.touch_banner_review();
REVOKE ALL ON FUNCTION public.prepare_banner_review() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_banner_review() FROM PUBLIC, anon, authenticated;

-- AI pre-evaluation of a banner file. Written only by the server (admin); scores stay with the teacher.
CREATE TABLE public.banner_diagnoses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  file_path TEXT,
  file_name TEXT,
  requested_by UUID,
  total NUMERIC NOT NULL DEFAULT 0,
  axes JSONB NOT NULL DEFAULT '[]'::jsonb,
  feedback JSONB NOT NULL DEFAULT '{}'::jsonb,
  critical BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX banner_diagnoses_group_idx ON public.banner_diagnoses (group_id, created_at DESC);

GRANT SELECT ON public.banner_diagnoses TO authenticated;
GRANT ALL ON public.banner_diagnoses TO service_role;
ALTER TABLE public.banner_diagnoses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teacher reads own group banner diagnoses" ON public.banner_diagnoses
  FOR SELECT TO authenticated USING (public.teaches_group(group_id));

-- Students read only the written guidance (no scores, no critical flag computation details).
CREATE OR REPLACE FUNCTION public.group_banner_diagnoses(_group_id UUID)
RETURNS TABLE (id UUID, version INT, file_path TEXT, file_name TEXT, created_at TIMESTAMPTZ, feedback JSONB)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT d.id, d.version, d.file_path, d.file_name, d.created_at, d.feedback
  FROM public.banner_diagnoses d
  WHERE d.group_id = _group_id AND public.is_group_member(_group_id)
  ORDER BY d.created_at DESC
$$;
REVOKE EXECUTE ON FUNCTION public.group_banner_diagnoses(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.group_banner_diagnoses(UUID) TO authenticated;

-- Members may change banner files before delivery, or while a teacher feedback round awaits the new version.
CREATE OR REPLACE FUNCTION public.can_edit_banner(_group_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_group_member(_group_id) AND (
    NOT EXISTS (
      SELECT 1 FROM public.projects p JOIN public.phase_submissions s ON s.project_id = p.id
      WHERE p.group_id = _group_id AND s.phase_number = 13
    )
    OR EXISTS (SELECT 1 FROM public.banner_reviews r WHERE r.group_id = _group_id AND r.resubmitted_at IS NULL)
  )
$$;

-- Students never touch the teacher's annotated files ("<group>/review-...").
DROP POLICY IF EXISTS "Group members replace banner" ON storage.objects;
DROP POLICY IF EXISTS "Group members remove banner" ON storage.objects;
CREATE POLICY "Group members replace banner" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'banners' AND public.can_edit_banner(public.banner_group(name)) AND position('/review-' in name) = 0)
  WITH CHECK (bucket_id = 'banners' AND public.can_edit_banner(public.banner_group(name)) AND position('/review-' in name) = 0);
CREATE POLICY "Group members remove banner" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'banners' AND public.can_edit_banner(public.banner_group(name)) AND position('/review-' in name) = 0);
CREATE POLICY "Teacher uploads annotated banner" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'banners' AND public.teaches_group(public.banner_group(name)));
CREATE POLICY "Teacher removes annotated banner" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'banners' AND public.teaches_group(public.banner_group(name)));

-- After delivery, the banner file only changes through resubmit_banner (which records the time).
CREATE OR REPLACE FUNCTION public.guard_project_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  IF NEW.project_seq IS DISTINCT FROM OLD.project_seq THEN
    RAISE EXCEPTION 'O número do projeto não pode ser alterado';
  END IF;
  IF NEW.code_number IS DISTINCT FROM OLD.code_number
     AND NOT public.teaches_group(OLD.group_id) THEN
    RAISE EXCEPTION 'Somente a professora pode mudar o número do projeto';
  END IF;
  IF NEW.area_code IS DISTINCT FROM OLD.area_code
     AND OLD.area_code IS NOT NULL
     AND NOT public.teaches_group(OLD.group_id) THEN
    RAISE EXCEPTION 'Somente a professora pode mudar a área do projeto';
  END IF;
  IF (NEW.banner_file_path IS DISTINCT FROM OLD.banner_file_path OR NEW.banner_file_hash IS DISTINCT FROM OLD.banner_file_hash)
     AND NOT public.teaches_group(OLD.group_id)
     AND current_setting('app.banner_resubmit', true) IS DISTINCT FROM 'on'
     AND EXISTS (SELECT 1 FROM public.phase_submissions s WHERE s.project_id = OLD.id AND s.phase_number = 13) THEN
    RAISE EXCEPTION 'O banner já foi entregue. Envie a nova versão pela devolutiva da professora.';
  END IF;
  RETURN NEW;
END;
$function$;

-- The group answers the open feedback round with a new file; identical files are rejected.
CREATE OR REPLACE FUNCTION public.resubmit_banner(_review_id UUID, _path TEXT, _name TEXT, _hash TEXT)
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
    SET resubmitted_at = _now, resubmitted_file_path = _path, resubmitted_file_name = _name, resubmitted_by = auth.uid()
    WHERE id = _review_id;
  RETURN _now;
END;
$$;
REVOKE ALL ON FUNCTION public.resubmit_banner(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resubmit_banner(UUID, TEXT, TEXT, TEXT) TO authenticated;