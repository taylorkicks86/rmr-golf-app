ALTER TABLE public.cup_scoring_settings
ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

UPDATE public.cup_scoring_settings
SET id = gen_random_uuid()
WHERE id IS NULL;

ALTER TABLE public.cup_scoring_settings
ALTER COLUMN id SET NOT NULL;

ALTER TABLE public.cup_scoring_settings
DROP CONSTRAINT IF EXISTS cup_scoring_settings_pkey;

ALTER TABLE public.cup_scoring_settings
ADD CONSTRAINT cup_scoring_settings_pkey PRIMARY KEY (id);

ALTER TABLE public.cup_scoring_settings
DROP CONSTRAINT IF EXISTS cup_scoring_settings_singleton_key_check;

ALTER TABLE public.cup_scoring_settings
ALTER COLUMN singleton_key DROP NOT NULL;

ALTER TABLE public.cup_scoring_settings
ADD COLUMN IF NOT EXISTS season_id uuid REFERENCES public.seasons(id) ON DELETE CASCADE;

UPDATE public.cup_scoring_settings
SET season_id = (
  SELECT id
  FROM public.seasons
  ORDER BY is_active DESC, year DESC, start_date DESC NULLS LAST, created_at DESC
  LIMIT 1
)
WHERE season_id IS NULL;

INSERT INTO public.cup_scoring_settings (season_id, scoring_positions, points_by_position)
SELECT season.id, 10, '[750,600,475,400,350,300,250,200,150,100]'::jsonb
FROM public.seasons season
WHERE NOT EXISTS (
  SELECT 1
  FROM public.cup_scoring_settings settings
  WHERE settings.season_id = season.id
);

ALTER TABLE public.cup_scoring_settings
ALTER COLUMN season_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS cup_scoring_settings_season_id_key
ON public.cup_scoring_settings (season_id);
