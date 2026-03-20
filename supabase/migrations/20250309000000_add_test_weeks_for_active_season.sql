-- Dev-friendly: add exactly 16 additional weeks beyond the current max week number
-- for the active (or latest) season.
-- Idempotent by (season_id, week_number) unique constraint.

with target_season as (
  select s.id, s.start_date
  from public.seasons s
  order by s.is_active desc, s.year desc, s.start_date desc
  limit 1
), season_max as (
  select
    ts.id as season_id,
    ts.start_date,
    coalesce(max(lw.week_number), 0) as current_max_week_number
  from target_season ts
  left join public.league_weeks lw
    on lw.season_id = ts.id
  group by ts.id, ts.start_date
), desired_weeks as (
  select
    sm.season_id,
    gs.week_number,
    (sm.start_date + ((gs.week_number - 1) * interval '7 days'))::date as week_date
  from season_max sm
  cross join lateral generate_series(
    sm.current_max_week_number + 1,
    sm.current_max_week_number + 16
  ) as gs(week_number)
)
insert into public.league_weeks (season_id, week_number, week_date)
select dw.season_id, dw.week_number, dw.week_date
from desired_weeks dw
on conflict (season_id, week_number) do nothing;
