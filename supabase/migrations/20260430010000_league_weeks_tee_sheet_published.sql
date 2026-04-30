ALTER TABLE public.league_weeks
ADD COLUMN IF NOT EXISTS tee_sheet_published boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_league_weeks_tee_sheet_published
ON public.league_weeks(tee_sheet_published);
