create table if not exists public.league_week_settings (
  league_week_id uuid primary key references public.league_weeks(id) on delete cascade,
  league_handicap_percent numeric(5, 2) not null default 80
    check (league_handicap_percent >= 0 and league_handicap_percent <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'weekly_handicaps'
      and column_name = 'league_handicap_percent'
  ) then
    insert into public.league_week_settings (league_week_id, league_handicap_percent)
    select
      league_week_id,
      coalesce(max(league_handicap_percent), 80)
    from public.weekly_handicaps
    group by league_week_id
    on conflict (league_week_id) do update
      set league_handicap_percent = excluded.league_handicap_percent;

    alter table public.weekly_handicaps
      drop column league_handicap_percent;
  end if;
end
$$;
