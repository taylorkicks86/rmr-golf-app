-- RMR Golf League - Initial Schema
-- Tables: players, seasons, league_weeks, weekly_participation, cup_teams, cup_team_members, weekly_scores

-- 1. players
-- Every player must log in; auth_user_id maps 1-to-1 to auth.users
-- GHIN and handicap_index required; no permanent active field
CREATE TABLE players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL UNIQUE,
  ghin text NOT NULL UNIQUE,
  handicap_index numeric(4, 1) NOT NULL CHECK (handicap_index >= 0 AND handicap_index <= 54),
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_players_auth_user_id ON players(auth_user_id);
CREATE INDEX idx_players_ghin ON players(ghin);
CREATE INDEX idx_players_email ON players(email);

-- 2. seasons
CREATE TABLE seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  year integer NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seasons_date_range CHECK (end_date >= start_date)
);

-- 3. league_weeks
CREATE TABLE league_weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  week_number integer NOT NULL,
  week_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(season_id, week_number)
);

CREATE INDEX idx_league_weeks_season_id ON league_weeks(season_id);

-- 4. cup_teams (before weekly_participation for FK)
CREATE TABLE cup_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cup_teams_season_id ON cup_teams(season_id);

-- 5. cup_team_members
-- 1 or 2 members per team; player can belong to 0 or 1 cup team per season
-- season_id denormalized for unique(player_id, season_id) constraint
CREATE TABLE cup_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cup_team_id uuid NOT NULL REFERENCES cup_teams(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(player_id, season_id),
  UNIQUE(cup_team_id, player_id)
);

-- Enforce season_id matches cup_team.season_id (CHECK cannot reference other tables)
CREATE OR REPLACE FUNCTION check_cup_team_member_season_match()
RETURNS TRIGGER AS $$
DECLARE
  team_season_id uuid;
BEGIN
  SELECT season_id INTO team_season_id FROM cup_teams WHERE id = NEW.cup_team_id;
  IF NEW.season_id IS DISTINCT FROM team_season_id THEN
    RAISE EXCEPTION 'cup_team_members.season_id must match cup_team.season_id';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_cup_team_member_season_match
  BEFORE INSERT OR UPDATE ON cup_team_members
  FOR EACH ROW
  EXECUTE FUNCTION check_cup_team_member_season_match();

-- Enforce 1-2 members per cup team
CREATE OR REPLACE FUNCTION check_cup_team_member_count()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM cup_team_members WHERE cup_team_id = NEW.cup_team_id) >= 2 THEN
    RAISE EXCEPTION 'Cup team cannot have more than 2 members';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_cup_team_member_count
  BEFORE INSERT ON cup_team_members
  FOR EACH ROW
  EXECUTE FUNCTION check_cup_team_member_count();

CREATE INDEX idx_cup_team_members_cup_team_id ON cup_team_members(cup_team_id);
CREATE INDEX idx_cup_team_members_player_id ON cup_team_members(player_id);
CREATE INDEX idx_cup_team_members_season_id ON cup_team_members(season_id);

-- 6. weekly_participation
-- playing_this_week = active for that week; cup = in cup competition; cup_scorer_for_team_id marks official cup scorer
CREATE TABLE weekly_participation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_week_id uuid NOT NULL REFERENCES league_weeks(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  playing_this_week boolean NOT NULL DEFAULT true,
  cup boolean NOT NULL DEFAULT false,
  cup_scorer_for_team_id uuid REFERENCES cup_teams(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(league_week_id, player_id),
  CONSTRAINT weekly_participation_cup_requires_playing
    CHECK (NOT cup OR playing_this_week)
);

CREATE INDEX idx_weekly_participation_league_week_id ON weekly_participation(league_week_id);
CREATE INDEX idx_weekly_participation_player_id ON weekly_participation(player_id);

-- One cup scorer per team per week (when designated)
CREATE UNIQUE INDEX idx_weekly_participation_cup_scorer_unique
  ON weekly_participation(league_week_id, cup_scorer_for_team_id)
  WHERE cup_scorer_for_team_id IS NOT NULL;

-- Validate cup_scorer_for_team_id when set:
-- - player must belong to that team
-- - team must belong to same season as league_week
-- - player must have playing_this_week = true
-- - player must have cup = true
CREATE OR REPLACE FUNCTION check_cup_scorer_for_team_id()
RETURNS TRIGGER AS $$
DECLARE
  week_season_id uuid;
  team_season_id uuid;
BEGIN
  IF NEW.cup_scorer_for_team_id IS NOT NULL THEN
    -- player must belong to that team
    IF NOT EXISTS (
      SELECT 1 FROM cup_team_members
      WHERE player_id = NEW.player_id AND cup_team_id = NEW.cup_scorer_for_team_id
    ) THEN
      RAISE EXCEPTION 'Player must be a member of the cup team to be designated cup scorer';
    END IF;

    -- team must belong to same season as league_week
    SELECT season_id INTO week_season_id FROM league_weeks WHERE id = NEW.league_week_id;
    SELECT season_id INTO team_season_id FROM cup_teams WHERE id = NEW.cup_scorer_for_team_id;
    IF week_season_id IS DISTINCT FROM team_season_id THEN
      RAISE EXCEPTION 'Cup team must belong to the same season as the league week';
    END IF;

    -- player must have playing_this_week = true
    IF NOT NEW.playing_this_week THEN
      RAISE EXCEPTION 'Player must have playing_this_week = true to be designated cup scorer';
    END IF;

    -- player must have cup = true
    IF NOT NEW.cup THEN
      RAISE EXCEPTION 'Player must have cup = true to be designated cup scorer';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_cup_scorer_for_team_id
  BEFORE INSERT OR UPDATE ON weekly_participation
  FOR EACH ROW
  EXECUTE FUNCTION check_cup_scorer_for_team_id();

-- 7. weekly_scores
CREATE TABLE weekly_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_week_id uuid NOT NULL REFERENCES league_weeks(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  gross_score integer NOT NULL CHECK (gross_score > 0 AND gross_score < 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(league_week_id, player_id)
);

CREATE INDEX idx_weekly_scores_league_week_id ON weekly_scores(league_week_id);
CREATE INDEX idx_weekly_scores_player_id ON weekly_scores(player_id);
