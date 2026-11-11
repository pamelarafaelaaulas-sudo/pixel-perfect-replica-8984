CREATE OR REPLACE FUNCTION public.is_valid_br_mobile(_raw text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE d text := regexp_replace(coalesce(_raw,''), '\D', '', 'g'); ddd int; num text;
BEGIN
  IF d LIKE '00%' THEN d := substr(d,3); END IF;
  IF d LIKE '0%' THEN d := substr(d,2); END IF;
  IF length(d) = 13 AND d LIKE '55%' THEN d := substr(d,3); END IF;
  IF length(d) <> 11 THEN RETURN false; END IF;
  ddd := substr(d,1,2)::int;
  IF NOT ddd = ANY(ARRAY[11,12,13,14,15,16,17,18,19,21,22,24,27,28,31,32,33,34,35,37,38,41,42,43,44,45,46,47,48,49,51,53,54,55,61,62,63,64,65,66,67,68,69,71,73,74,75,77,79,81,82,83,84,85,86,87,88,89,91,92,93,94,95,96,97,98,99]) THEN RETURN false; END IF;
  num := substr(d,3);
  IF substr(num,1,1) <> '9' OR substr(num,2,1) NOT IN ('6','7','8','9') THEN RETURN false; END IF;
  IF substr(num,2) ~ '^(\d)\1+$' THEN RETURN false; END IF;
  IF substr(num,2) IN ('12345678','87654321','23456789','98765432') THEN RETURN false; END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.guard_member_whatsapp()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR NEW.whatsapp IS DISTINCT FROM OLD.whatsapp) AND NOT public.is_valid_br_mobile(NEW.whatsapp) THEN
    RAISE EXCEPTION 'WhatsApp inválido. Use um celular real com DDD, ex.: (65) 99999-1234';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_member_whatsapp ON public.group_members;
CREATE TRIGGER guard_member_whatsapp BEFORE INSERT OR UPDATE OF whatsapp ON public.group_members
FOR EACH ROW EXECUTE FUNCTION public.guard_member_whatsapp();