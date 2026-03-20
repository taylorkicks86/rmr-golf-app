CREATE TABLE IF NOT EXISTS public.league_app_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton_key boolean NOT NULL DEFAULT true,
  current_dashboard_week_id uuid NULL REFERENCES public.league_weeks(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (singleton_key)
);

INSERT INTO public.league_app_state (singleton_key)
VALUES (true)
ON CONFLICT (singleton_key) DO NOTHING;
