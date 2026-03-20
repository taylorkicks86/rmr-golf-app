alter table public.league_weeks
add column if not exists side_to_play text;

update public.league_weeks
set side_to_play = 'front'
where side_to_play is null;

alter table public.league_weeks
drop constraint if exists league_weeks_side_to_play_check;

alter table public.league_weeks
add constraint league_weeks_side_to_play_check
check (side_to_play in ('front', 'back'));

alter table public.league_weeks
alter column side_to_play set not null;
