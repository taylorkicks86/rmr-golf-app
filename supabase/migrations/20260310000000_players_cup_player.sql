ALTER TABLE public.players
ADD COLUMN IF NOT EXISTS cup_player boolean NOT NULL DEFAULT false;

