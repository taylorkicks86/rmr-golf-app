ALTER TABLE public.league_weeks
  ADD COLUMN IF NOT EXISTS play_date date;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'weekly_tee_times'
      AND column_name = 'league_week_id'
  ) THEN
    ALTER TABLE public.weekly_tee_times
      RENAME COLUMN league_week_id TO week_id;
  END IF;
END $$;

ALTER TABLE public.weekly_tee_times
  ADD COLUMN IF NOT EXISTS group_number integer,
  ADD COLUMN IF NOT EXISTS position_in_group integer,
  ADD COLUMN IF NOT EXISTS notes text;

UPDATE public.weekly_tee_times
SET group_number = 1
WHERE group_number IS NULL;

ALTER TABLE public.weekly_tee_times
  ALTER COLUMN week_id SET NOT NULL,
  ALTER COLUMN group_number SET NOT NULL;

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname
  INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.weekly_tee_times'::regclass
    AND contype = 'u'
    AND pg_get_constraintdef(oid) ILIKE '%player_id%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.weekly_tee_times DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE public.weekly_tee_times
  ADD CONSTRAINT weekly_tee_times_week_player_unique UNIQUE (week_id, player_id);

DROP INDEX IF EXISTS public.idx_weekly_tee_times_league_week_id;
CREATE INDEX IF NOT EXISTS idx_weekly_tee_times_week_group_time
  ON public.weekly_tee_times(week_id, group_number, tee_time);

ALTER TABLE public.weekly_tee_times ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS weekly_tee_times_admin_select ON public.weekly_tee_times;
CREATE POLICY weekly_tee_times_admin_select
ON public.weekly_tee_times
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.players p
    WHERE p.auth_user_id = auth.uid()
      AND p.is_admin = true
  )
);

DROP POLICY IF EXISTS weekly_tee_times_admin_insert ON public.weekly_tee_times;
CREATE POLICY weekly_tee_times_admin_insert
ON public.weekly_tee_times
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.players p
    WHERE p.auth_user_id = auth.uid()
      AND p.is_admin = true
  )
);

DROP POLICY IF EXISTS weekly_tee_times_admin_update ON public.weekly_tee_times;
CREATE POLICY weekly_tee_times_admin_update
ON public.weekly_tee_times
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.players p
    WHERE p.auth_user_id = auth.uid()
      AND p.is_admin = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.players p
    WHERE p.auth_user_id = auth.uid()
      AND p.is_admin = true
  )
);

DROP POLICY IF EXISTS weekly_tee_times_admin_delete ON public.weekly_tee_times;
CREATE POLICY weekly_tee_times_admin_delete
ON public.weekly_tee_times
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.players p
    WHERE p.auth_user_id = auth.uid()
      AND p.is_admin = true
  )
);

DROP POLICY IF EXISTS weekly_tee_times_player_read_self ON public.weekly_tee_times;
CREATE POLICY weekly_tee_times_player_read_self
ON public.weekly_tee_times
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.players p
    WHERE p.auth_user_id = auth.uid()
      AND p.id = weekly_tee_times.player_id
  )
);
