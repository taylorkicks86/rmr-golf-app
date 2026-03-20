ALTER TABLE public.league_weeks
  ADD COLUMN is_finalized boolean NOT NULL DEFAULT false;
