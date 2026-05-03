CREATE TABLE IF NOT EXISTS public.cup_scoring_settings (
  singleton_key boolean PRIMARY KEY DEFAULT true CHECK (singleton_key),
  scoring_positions integer NOT NULL DEFAULT 10 CHECK (scoring_positions BETWEEN 1 AND 20),
  points_by_position jsonb NOT NULL DEFAULT '[750,600,475,400,350,300,250,200,150,100]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cup_scoring_settings_points_array CHECK (jsonb_typeof(points_by_position) = 'array')
);

INSERT INTO public.cup_scoring_settings (singleton_key, scoring_positions, points_by_position)
VALUES (true, 10, '[750,600,475,400,350,300,250,200,150,100]'::jsonb)
ON CONFLICT (singleton_key) DO NOTHING;

ALTER TABLE public.cup_scoring_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cup_scoring_settings_admin_select ON public.cup_scoring_settings;
CREATE POLICY cup_scoring_settings_admin_select
ON public.cup_scoring_settings
FOR SELECT
TO authenticated
USING (public.current_player_is_admin());

DROP POLICY IF EXISTS cup_scoring_settings_admin_all ON public.cup_scoring_settings;
CREATE POLICY cup_scoring_settings_admin_all
ON public.cup_scoring_settings
FOR ALL
TO authenticated
USING (public.current_player_is_admin())
WITH CHECK (public.current_player_is_admin());
