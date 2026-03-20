ALTER TABLE public.players
ADD COLUMN IF NOT EXISTS is_approved boolean NOT NULL DEFAULT false;

UPDATE public.players
SET is_approved = true
WHERE is_approved = false;

CREATE INDEX IF NOT EXISTS idx_players_is_approved ON public.players(is_approved);
