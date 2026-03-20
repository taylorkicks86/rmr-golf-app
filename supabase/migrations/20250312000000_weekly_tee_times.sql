CREATE TABLE IF NOT EXISTS public.weekly_tee_times (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_week_id uuid NOT NULL REFERENCES public.league_weeks(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  tee_time time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (league_week_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_weekly_tee_times_league_week_id
  ON public.weekly_tee_times(league_week_id);

CREATE INDEX IF NOT EXISTS idx_weekly_tee_times_player_id
  ON public.weekly_tee_times(player_id);
