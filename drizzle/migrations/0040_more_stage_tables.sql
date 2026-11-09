ALTER TABLE public.projects ADD COLUMN methodology_tables jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.projects ADD COLUMN introduction_tables jsonb NOT NULL DEFAULT '[]'::jsonb;