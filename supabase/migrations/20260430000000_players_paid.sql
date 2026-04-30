ALTER TABLE public.players
ADD COLUMN IF NOT EXISTS paid boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_players_paid_full_name ON public.players(paid DESC, full_name ASC);
