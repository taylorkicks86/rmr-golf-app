-- Allow three-state attendance in weekly_participation:
-- true = Yes, false = No, null = No Response.
ALTER TABLE public.weekly_participation
  ALTER COLUMN playing_this_week DROP NOT NULL,
  ALTER COLUMN playing_this_week DROP DEFAULT;

-- Ensure existing rows do not keep cup selected unless actively playing.
UPDATE public.weekly_participation
SET cup = false
WHERE cup = true
  AND playing_this_week IS DISTINCT FROM true;

ALTER TABLE public.weekly_participation
  DROP CONSTRAINT IF EXISTS weekly_participation_cup_requires_playing;

ALTER TABLE public.weekly_participation
  ADD CONSTRAINT weekly_participation_cup_requires_playing
  CHECK (NOT cup OR playing_this_week IS TRUE);

-- Keep cup scorer validation aligned with nullable playing_this_week.
CREATE OR REPLACE FUNCTION check_cup_scorer_for_team_id()
RETURNS TRIGGER AS $$
DECLARE
  week_season_id uuid;
  team_season_id uuid;
BEGIN
  IF NEW.cup_scorer_for_team_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM cup_team_members
      WHERE player_id = NEW.player_id AND cup_team_id = NEW.cup_scorer_for_team_id
    ) THEN
      RAISE EXCEPTION 'Player must be a member of the cup team to be designated cup scorer';
    END IF;

    SELECT season_id INTO week_season_id FROM league_weeks WHERE id = NEW.league_week_id;
    SELECT season_id INTO team_season_id FROM cup_teams WHERE id = NEW.cup_scorer_for_team_id;
    IF week_season_id IS DISTINCT FROM team_season_id THEN
      RAISE EXCEPTION 'Cup team must belong to the same season as the league week';
    END IF;

    IF NEW.playing_this_week IS NOT TRUE THEN
      RAISE EXCEPTION 'Player must have playing_this_week = true to be designated cup scorer';
    END IF;

    IF NOT NEW.cup THEN
      RAISE EXCEPTION 'Player must have cup = true to be designated cup scorer';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
