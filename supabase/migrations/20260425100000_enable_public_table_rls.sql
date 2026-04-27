-- Enable RLS on public application tables and add policies that preserve the
-- authenticated league app while blocking anonymous table access.

create or replace function public.current_player_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.players p
  where p.auth_user_id = auth.uid()
  limit 1
$$;

create or replace function public.current_player_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select p.is_admin
    from public.players p
    where p.auth_user_id = auth.uid()
    limit 1
  ), false)
$$;

create or replace function public.can_edit_week_scores(p_week_id uuid, p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_player_is_admin()
    or exists (
      select 1
      from public.players requester
      join public.weekly_tee_times requester_tee
        on requester_tee.player_id = requester.id
       and requester_tee.week_id = p_week_id
      join public.weekly_tee_times target_tee
        on target_tee.week_id = requester_tee.week_id
       and target_tee.group_number = requester_tee.group_number
       and target_tee.tee_time = requester_tee.tee_time
       and target_tee.player_id = p_player_id
      join public.league_weeks week
        on week.id = p_week_id
      where requester.auth_user_id = auth.uid()
        and week.is_finalized = false
    )
$$;

grant execute on function public.current_player_id() to authenticated;
grant execute on function public.current_player_is_admin() to authenticated;
grant execute on function public.can_edit_week_scores(uuid, uuid) to authenticated;

alter table public.players enable row level security;
alter table public.seasons enable row level security;
alter table public.league_weeks enable row level security;
alter table public.cup_teams enable row level security;
alter table public.cup_team_members enable row level security;
alter table public.weekly_participation enable row level security;
alter table public.weekly_scores enable row level security;
alter table public.hole_scores enable row level security;
alter table public.weekly_tee_times enable row level security;
alter table public.league_app_state enable row level security;
alter table public.course_configs enable row level security;
alter table public.course_holes enable row level security;
alter table public.weekly_cup_results enable row level security;
alter table public.weekly_handicaps enable row level security;
alter table public.league_week_settings enable row level security;
alter table public.league_points enable row level security;

-- players
drop policy if exists players_authenticated_select on public.players;
create policy players_authenticated_select
on public.players for select
to authenticated
using (true);

drop policy if exists players_self_insert on public.players;
create policy players_self_insert
on public.players for insert
to authenticated
with check (
  auth_user_id = auth.uid()
  and is_admin = false
  and is_approved = false
);

drop policy if exists players_self_or_admin_update on public.players;
create policy players_self_or_admin_update
on public.players for update
to authenticated
using (
  public.current_player_is_admin()
  or auth_user_id = auth.uid()
  or (auth_user_id is null and lower(email) = lower(auth.jwt() ->> 'email'))
)
with check (
  public.current_player_is_admin()
  or (
    auth_user_id = auth.uid()
    and is_admin = false
  )
);

drop policy if exists players_admin_delete on public.players;
create policy players_admin_delete
on public.players for delete
to authenticated
using (public.current_player_is_admin());

-- read-mostly league metadata
drop policy if exists seasons_authenticated_select on public.seasons;
create policy seasons_authenticated_select on public.seasons for select to authenticated using (true);
drop policy if exists seasons_admin_all on public.seasons;
create policy seasons_admin_all on public.seasons for all to authenticated
using (public.current_player_is_admin())
with check (public.current_player_is_admin());

drop policy if exists league_weeks_authenticated_select on public.league_weeks;
create policy league_weeks_authenticated_select on public.league_weeks for select to authenticated using (true);
drop policy if exists league_weeks_admin_all on public.league_weeks;
create policy league_weeks_admin_all on public.league_weeks for all to authenticated
using (public.current_player_is_admin())
with check (public.current_player_is_admin());

drop policy if exists cup_teams_authenticated_select on public.cup_teams;
create policy cup_teams_authenticated_select on public.cup_teams for select to authenticated using (true);
drop policy if exists cup_teams_admin_all on public.cup_teams;
create policy cup_teams_admin_all on public.cup_teams for all to authenticated
using (public.current_player_is_admin())
with check (public.current_player_is_admin());

drop policy if exists cup_team_members_authenticated_select on public.cup_team_members;
create policy cup_team_members_authenticated_select on public.cup_team_members for select to authenticated using (true);
drop policy if exists cup_team_members_admin_all on public.cup_team_members;
create policy cup_team_members_admin_all on public.cup_team_members for all to authenticated
using (public.current_player_is_admin())
with check (public.current_player_is_admin());

drop policy if exists league_app_state_authenticated_select on public.league_app_state;
create policy league_app_state_authenticated_select on public.league_app_state for select to authenticated using (true);
drop policy if exists league_app_state_admin_all on public.league_app_state;
create policy league_app_state_admin_all on public.league_app_state for all to authenticated
using (public.current_player_is_admin())
with check (public.current_player_is_admin());

drop policy if exists course_configs_authenticated_select on public.course_configs;
create policy course_configs_authenticated_select on public.course_configs for select to authenticated using (true);
drop policy if exists course_configs_admin_all on public.course_configs;
create policy course_configs_admin_all on public.course_configs for all to authenticated
using (public.current_player_is_admin())
with check (public.current_player_is_admin());

drop policy if exists course_holes_authenticated_select on public.course_holes;
create policy course_holes_authenticated_select on public.course_holes for select to authenticated using (true);
drop policy if exists course_holes_admin_all on public.course_holes;
create policy course_holes_admin_all on public.course_holes for all to authenticated
using (public.current_player_is_admin())
with check (public.current_player_is_admin());

drop policy if exists league_week_settings_authenticated_select on public.league_week_settings;
create policy league_week_settings_authenticated_select on public.league_week_settings for select to authenticated using (true);
drop policy if exists league_week_settings_admin_all on public.league_week_settings;
create policy league_week_settings_admin_all on public.league_week_settings for all to authenticated
using (public.current_player_is_admin())
with check (public.current_player_is_admin());

drop policy if exists league_points_authenticated_select on public.league_points;
create policy league_points_authenticated_select on public.league_points for select to authenticated using (true);
drop policy if exists league_points_admin_all on public.league_points;
create policy league_points_admin_all on public.league_points for all to authenticated
using (public.current_player_is_admin())
with check (public.current_player_is_admin());

-- participation and results
drop policy if exists weekly_participation_authenticated_select on public.weekly_participation;
create policy weekly_participation_authenticated_select
on public.weekly_participation for select
to authenticated
using (true);

drop policy if exists weekly_participation_self_or_admin_insert on public.weekly_participation;
create policy weekly_participation_self_or_admin_insert
on public.weekly_participation for insert
to authenticated
with check (
  public.current_player_is_admin()
  or player_id = public.current_player_id()
);

drop policy if exists weekly_participation_self_or_admin_update on public.weekly_participation;
create policy weekly_participation_self_or_admin_update
on public.weekly_participation for update
to authenticated
using (
  public.current_player_is_admin()
  or player_id = public.current_player_id()
)
with check (
  public.current_player_is_admin()
  or player_id = public.current_player_id()
);

drop policy if exists weekly_participation_admin_delete on public.weekly_participation;
create policy weekly_participation_admin_delete
on public.weekly_participation for delete
to authenticated
using (public.current_player_is_admin());

drop policy if exists weekly_scores_authenticated_select on public.weekly_scores;
create policy weekly_scores_authenticated_select on public.weekly_scores for select to authenticated using (true);
drop policy if exists weekly_scores_group_or_admin_insert on public.weekly_scores;
create policy weekly_scores_group_or_admin_insert on public.weekly_scores for insert to authenticated
with check (public.can_edit_week_scores(league_week_id, player_id));
drop policy if exists weekly_scores_group_or_admin_update on public.weekly_scores;
create policy weekly_scores_group_or_admin_update on public.weekly_scores for update to authenticated
using (public.can_edit_week_scores(league_week_id, player_id))
with check (public.can_edit_week_scores(league_week_id, player_id));
drop policy if exists weekly_scores_group_or_admin_delete on public.weekly_scores;
create policy weekly_scores_group_or_admin_delete on public.weekly_scores for delete to authenticated
using (public.can_edit_week_scores(league_week_id, player_id));

drop policy if exists hole_scores_authenticated_select on public.hole_scores;
create policy hole_scores_authenticated_select on public.hole_scores for select to authenticated using (true);
drop policy if exists hole_scores_group_or_admin_insert on public.hole_scores;
create policy hole_scores_group_or_admin_insert on public.hole_scores for insert to authenticated
with check (public.can_edit_week_scores(league_week_id, player_id));
drop policy if exists hole_scores_group_or_admin_update on public.hole_scores;
create policy hole_scores_group_or_admin_update on public.hole_scores for update to authenticated
using (public.can_edit_week_scores(league_week_id, player_id))
with check (public.can_edit_week_scores(league_week_id, player_id));
drop policy if exists hole_scores_group_or_admin_delete on public.hole_scores;
create policy hole_scores_group_or_admin_delete on public.hole_scores for delete to authenticated
using (public.can_edit_week_scores(league_week_id, player_id));

drop policy if exists weekly_cup_results_authenticated_select on public.weekly_cup_results;
create policy weekly_cup_results_authenticated_select on public.weekly_cup_results for select to authenticated using (true);
drop policy if exists weekly_cup_results_admin_all on public.weekly_cup_results;
create policy weekly_cup_results_admin_all on public.weekly_cup_results for all to authenticated
using (public.current_player_is_admin())
with check (public.current_player_is_admin());

drop policy if exists weekly_handicaps_authenticated_select on public.weekly_handicaps;
create policy weekly_handicaps_authenticated_select on public.weekly_handicaps for select to authenticated using (true);
drop policy if exists weekly_handicaps_admin_all on public.weekly_handicaps;
create policy weekly_handicaps_admin_all on public.weekly_handicaps for all to authenticated
using (public.current_player_is_admin())
with check (public.current_player_is_admin());

-- weekly_tee_times had older narrow policies; replace them with current app rules.
drop policy if exists weekly_tee_times_admin_select on public.weekly_tee_times;
drop policy if exists weekly_tee_times_admin_insert on public.weekly_tee_times;
drop policy if exists weekly_tee_times_admin_update on public.weekly_tee_times;
drop policy if exists weekly_tee_times_admin_delete on public.weekly_tee_times;
drop policy if exists weekly_tee_times_player_read_self on public.weekly_tee_times;
drop policy if exists weekly_tee_times_authenticated_select on public.weekly_tee_times;
create policy weekly_tee_times_authenticated_select
on public.weekly_tee_times for select
to authenticated
using (true);

drop policy if exists weekly_tee_times_admin_all on public.weekly_tee_times;
create policy weekly_tee_times_admin_all
on public.weekly_tee_times for all
to authenticated
using (public.current_player_is_admin())
with check (public.current_player_is_admin());
