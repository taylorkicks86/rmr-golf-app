-- Enforce only one active season at a time.
-- Keep the most recently updated active season if multiple active rows exist.

WITH ranked_active AS (
  SELECT id, row_number() OVER (ORDER BY updated_at DESC, created_at DESC, id DESC) AS rn
  FROM public.seasons
  WHERE is_active = true
)
UPDATE public.seasons
SET is_active = false
WHERE id IN (
  SELECT id
  FROM ranked_active
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_seasons_single_active
  ON public.seasons (is_active)
  WHERE is_active = true;
