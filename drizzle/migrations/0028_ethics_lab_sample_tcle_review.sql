ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS ethics_lab BOOLEAN,
  ADD COLUMN IF NOT EXISTS ethics_lab_epis TEXT,
  ADD COLUMN IF NOT EXISTS ethics_biosafety_declared_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ethics_population INTEGER,
  ADD COLUMN IF NOT EXISTS ethics_sample_size INTEGER,
  ADD COLUMN IF NOT EXISTS ethics_review_status TEXT,
  ADD COLUMN IF NOT EXISTS ethics_review_note TEXT,
  ADD COLUMN IF NOT EXISTS ethics_reviewed_at TIMESTAMPTZ;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_ethics_review_status_check CHECK (ethics_review_status IS NULL OR ethics_review_status IN ('aprovado', 'refazer')),
  ADD CONSTRAINT projects_ethics_numbers_check CHECK ((ethics_population IS NULL OR ethics_population > 0) AND (ethics_sample_size IS NULL OR ethics_sample_size > 0));

COMMENT ON COLUMN public.projects.ethics_review_status IS 'Teacher ethics validation: NULL = awaiting, aprovado, refazer. Only the teacher may set it.';

-- Only the class teacher sets the ethics review; a student editing ethics answers after "refazer" sends it back to awaiting.
CREATE OR REPLACE FUNCTION public.guard_ethics_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF public.teaches_group(NEW.group_id) THEN RETURN NEW; END IF;
  IF NEW.ethics_review_status IS DISTINCT FROM OLD.ethics_review_status
     OR NEW.ethics_review_note IS DISTINCT FROM OLD.ethics_review_note
     OR NEW.ethics_reviewed_at IS DISTINCT FROM OLD.ethics_reviewed_at THEN
    IF auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'Só a professora pode validar a triagem ética.'; END IF;
    RETURN NEW;
  END IF;
  IF OLD.ethics_review_status = 'aprovado' AND (
       NEW.ethics_human_research IS DISTINCT FROM OLD.ethics_human_research
    OR NEW.ethics_collection IS DISTINCT FROM OLD.ethics_collection
    OR NEW.ethics_form_url IS DISTINCT FROM OLD.ethics_form_url
    OR NEW.ethics_lab IS DISTINCT FROM OLD.ethics_lab
    OR NEW.ethics_lab_epis IS DISTINCT FROM OLD.ethics_lab_epis
    OR NEW.ethics_biosafety_declared_at IS DISTINCT FROM OLD.ethics_biosafety_declared_at
    OR NEW.ethics_population IS DISTINCT FROM OLD.ethics_population
    OR NEW.ethics_sample_size IS DISTINCT FROM OLD.ethics_sample_size) THEN
    RAISE EXCEPTION 'A triagem ética já foi aprovada pela professora e não pode mais ser alterada.';
  END IF;
  IF OLD.ethics_review_status = 'refazer' AND (
       NEW.ethics_human_research IS DISTINCT FROM OLD.ethics_human_research
    OR NEW.ethics_collection IS DISTINCT FROM OLD.ethics_collection
    OR NEW.ethics_form_url IS DISTINCT FROM OLD.ethics_form_url
    OR NEW.ethics_lab IS DISTINCT FROM OLD.ethics_lab
    OR NEW.ethics_lab_epis IS DISTINCT FROM OLD.ethics_lab_epis
    OR NEW.ethics_biosafety_declared_at IS DISTINCT FROM OLD.ethics_biosafety_declared_at
    OR NEW.ethics_population IS DISTINCT FROM OLD.ethics_population
    OR NEW.ethics_sample_size IS DISTINCT FROM OLD.ethics_sample_size) THEN
    NEW.ethics_review_status := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_ethics_review() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER projects_guard_ethics_review BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.guard_ethics_review();

-- Extra Metodologia (7) rules and the ethics gate before Introdução (8). Mirrored by ethicsExtraProblems in src/lib/ethics.ts.
CREATE OR REPLACE FUNCTION public.ethics_extra_problem(_p projects, _phase integer)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF _phase = 7 THEN
    IF _p.ethics_lab IS NULL THEN RETURN 'Responda se a pesquisa usa laboratório ou reagentes (biossegurança).'; END IF;
    IF _p.ethics_human_research THEN
      IF _p.ethics_population IS NULL OR _p.ethics_sample_size IS NULL THEN
        RETURN 'Preencha a calculadora de amostragem: tamanho da população e da amostra.';
      END IF;
      IF _p.ethics_sample_size > _p.ethics_population THEN RETURN 'A amostra não pode ser maior que a população.'; END IF;
      IF 'presencial' = ANY(_p.ethics_collection) AND NOT EXISTS (
        SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'ethics-docs' AND o.name LIKE _p.group_id::text || '/%') THEN
        RETURN 'Envie pelo menos um TCLE assinado (PDF ou DOCX) para a coleta presencial.';
      END IF;
    END IF;
    IF _p.ethics_lab THEN
      IF coalesce(btrim(_p.ethics_lab_epis), '') = '' THEN RETURN 'Liste os EPIs que o grupo vai usar no laboratório.'; END IF;
      IF _p.ethics_biosafety_declared_at IS NULL THEN RETURN 'Marque a declaração de EPIs e biossegurança.'; END IF;
    END IF;
  ELSIF _phase = 8 THEN
    IF (_p.ethics_human_research OR _p.ethics_lab) AND _p.ethics_review_status IS DISTINCT FROM 'aprovado' THEN
      RETURN 'Aguardando validação ética da professora: a próxima etapa só abre depois da aprovação.';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.ethics_extra_problem(projects, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ethics_extra_problem(projects, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.phase_rule_problem(_p projects, _phase integer)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  _problem TEXT;
  _template TEXT;
  _form TEXT;
  _video TEXT;
BEGIN
  _problem := public.phase_rule_problem_base(_p, _phase);
  IF _problem IS NULL THEN _problem := public.ethics_extra_problem(_p, _phase); END IF;
  IF _problem IS NOT NULL OR _phase NOT IN (1, 7, 13) THEN RETURN _problem; END IF;
  SELECT c.banner_template_url, c.ethics_form_template_url, c.diary_video_url INTO _template, _form, _video
  FROM public.groups g JOIN public.classes c ON c.id = g.class_id
  WHERE g.id = _p.group_id;
  IF _phase = 1 THEN
    IF coalesce(btrim(_video), '') <> '' AND _p.diary_video_watched_at IS NULL THEN
      RETURN 'Assistam ao vídeo do Diário de Bordo e marquem que assistiram antes de entregar.';
    END IF;
  ELSIF _phase = 13 THEN
    IF public.canva_design_id(_p.banner_canva_url) IS NOT NULL
       AND lower(public.canva_design_id(_p.banner_canva_url)) = lower(public.canva_design_id(_template)) THEN
      RETURN 'Esse é o link do modelo da professora. Use o modelo no Canva e cole o link da cópia do grupo.';
    END IF;
  ELSIF _p.ethics_human_research AND 'online' = ANY(_p.ethics_collection)
     AND _form IS NOT NULL
     AND rtrim(lower(btrim(_p.ethics_form_url)), '/') = rtrim(lower(btrim(_form)), '/') THEN
    RETURN 'Esse é o link do modelo da professora. Faça uma cópia do formulário e cole o link do formulário do grupo.';
  END IF;
  RETURN NULL;
END;
$function$;

-- Signed TCLEs: private bucket ethics-docs at <group_id>/<file>; members upload/delete, members and teacher read.
CREATE POLICY "ethics docs member insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ethics-docs' AND public.is_group_member(((storage.foldername(name))[1])::uuid)
    AND lower(name) ~ '\.(pdf|docx)$');
CREATE POLICY "ethics docs read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'ethics-docs' AND (public.is_group_member(((storage.foldername(name))[1])::uuid) OR public.teaches_group(((storage.foldername(name))[1])::uuid)));
CREATE POLICY "ethics docs member delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'ethics-docs' AND public.is_group_member(((storage.foldername(name))[1])::uuid));