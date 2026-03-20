DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname
  INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.hole_scores'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%strokes%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.hole_scores DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE public.hole_scores
  ADD CONSTRAINT hole_scores_strokes_range CHECK (strokes >= 1 AND strokes <= 12);
