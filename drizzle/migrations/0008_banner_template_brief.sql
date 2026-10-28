ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS banner_size TEXT,
  ADD COLUMN IF NOT EXISTS banner_sections TEXT[],
  ADD COLUMN IF NOT EXISTS banner_instructions TEXT;
COMMENT ON COLUMN public.classes.banner_size IS 'Banner size the teacher asks for (e.g. 90 x 120 cm).';
COMMENT ON COLUMN public.classes.banner_sections IS 'Sections the banner must have, in order; null = app default list.';
COMMENT ON COLUMN public.classes.banner_instructions IS 'Free-text banner guidance from the teacher.';