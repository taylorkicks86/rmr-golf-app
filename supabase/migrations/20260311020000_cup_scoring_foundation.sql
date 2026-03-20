-- Cup scoring foundation:
-- 1) player-level cup eligibility flag
-- 2) week type + status controls
-- 3) participation attendance status
-- 4) per-week cup points/results table

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS cup boolean NOT NULL DEFAULT false;

-- Backfill from prior cup_player flag when present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'players'
      AND column_name = 'cup_player'
  ) THEN
    UPDATE public.players
    SET cup = cup_player
    WHERE cup IS DISTINCT FROM cup_player;
  END IF;
END $$;

ALTER TABLE public.league_weeks
  ADD COLUMN IF NOT EXISTS week_type text NOT NULL DEFAULT 'regular',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'league_weeks_week_type_check'
  ) THEN
    ALTER TABLE public.league_weeks
      ADD CONSTRAINT league_weeks_week_type_check
      CHECK (week_type IN ('regular', 'playoff'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'league_weeks_status_check'
  ) THEN
    ALTER TABLE public.league_weeks
      ADD CONSTRAINT league_weeks_status_check
      CHECK (status IN ('open', 'finalized', 'cancelled', 'rained_out'));
  END IF;
END $$;

UPDATE public.league_weeks
SET week_type = COALESCE(week_type, 'regular');

UPDATE public.league_weeks
SET status = CASE WHEN is_finalized THEN 'finalized' ELSE 'open' END
WHERE status IS NULL
   OR status NOT IN ('open', 'finalized', 'cancelled', 'rained_out');

ALTER TABLE public.weekly_participation
  ADD COLUMN IF NOT EXISTS attendance_status text NOT NULL DEFAULT 'no_response';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'weekly_participation_attendance_status_check'
  ) THEN
    ALTER TABLE public.weekly_participation
      ADD CONSTRAINT weekly_participation_attendance_status_check
      CHECK (attendance_status IN ('playing', 'not_playing', 'no_response'));
  END IF;
END $$;

UPDATE public.weekly_participation
SET attendance_status = CASE
  WHEN playing_this_week IS TRUE THEN 'playing'
  WHEN playing_this_week IS FALSE THEN 'not_playing'
  ELSE 'no_response'
END;

CREATE TABLE IF NOT EXISTS public.weekly_cup_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_week_id uuid NOT NULL REFERENCES public.league_weeks(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  gross_score numeric(5,2),
  net_score numeric(5,2),
  finish_position integer,
  points_earned numeric(8,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (league_week_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_weekly_cup_results_week ON public.weekly_cup_results(league_week_id);
CREATE INDEX IF NOT EXISTS idx_weekly_cup_results_player ON public.weekly_cup_results(player_id);
