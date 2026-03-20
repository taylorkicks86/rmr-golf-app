create table if not exists public.weekly_handicaps (
  id uuid primary key default gen_random_uuid(),
  league_week_id uuid not null references public.league_weeks(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  handicap_index numeric(4, 1) not null check (handicap_index >= 0 and handicap_index <= 54),
  course_handicap numeric(5, 2) not null check (course_handicap >= 0 and course_handicap <= 99.99),
  league_handicap_percent numeric(5, 2) not null check (league_handicap_percent >= 0 and league_handicap_percent <= 100),
  final_computed_handicap integer not null check (final_computed_handicap >= 0 and final_computed_handicap <= 99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league_week_id, player_id)
);

create index if not exists idx_weekly_handicaps_week
  on public.weekly_handicaps (league_week_id);

create index if not exists idx_weekly_handicaps_player
  on public.weekly_handicaps (player_id);
