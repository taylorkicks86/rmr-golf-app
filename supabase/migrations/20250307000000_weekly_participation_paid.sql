-- Add paid column to weekly_participation (independent of playing_this_week and cup).

ALTER TABLE public.weekly_participation
  ADD COLUMN paid boolean NOT NULL DEFAULT false;
