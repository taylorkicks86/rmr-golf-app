CREATE TABLE IF NOT EXISTS public.hole_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  league_week_id uuid NOT NULL REFERENCES public.league_weeks(id) ON DELETE CASCADE,
  hole_number integer NOT NULL CHECK (hole_number >= 1 AND hole_number <= 9),
  strokes integer NOT NULL CHECK (strokes > 0 AND strokes < 30),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, league_week_id, hole_number)
);

CREATE INDEX IF NOT EXISTS idx_hole_scores_league_week_id ON public.hole_scores(league_week_id);
CREATE INDEX IF NOT EXISTS idx_hole_scores_player_id ON public.hole_scores(player_id);
