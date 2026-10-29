ALTER TABLE public.classes ADD COLUMN fair_at TIMESTAMPTZ, ADD COLUMN fair_name TEXT NOT NULL DEFAULT 'FECITI/MS';
COMMENT ON COLUMN public.classes.fair_at IS 'Date/time of the science fair shown as a countdown; the teacher sets it once for all her classes.';
COMMENT ON COLUMN public.classes.fair_name IS 'Name of the science fair shown with the countdown.';

-- New classes inherit the teacher's fair date and name from her latest class.
CREATE OR REPLACE FUNCTION public.inherit_class_fair()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _prev RECORD;
BEGIN
  IF NEW.fair_at IS NULL THEN
    SELECT fair_at, fair_name INTO _prev FROM public.classes
    WHERE teacher_id = NEW.teacher_id AND fair_at IS NOT NULL
    ORDER BY created_at DESC LIMIT 1;
    IF FOUND THEN
      NEW.fair_at := _prev.fair_at;
      NEW.fair_name := _prev.fair_name;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.inherit_class_fair() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER classes_inherit_fair
  BEFORE INSERT ON public.classes
  FOR EACH ROW EXECUTE FUNCTION public.inherit_class_fair();