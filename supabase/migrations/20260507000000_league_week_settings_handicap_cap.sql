alter table public.league_week_settings
  add column if not exists handicap_cap integer
    check (handicap_cap is null or (handicap_cap >= -20 and handicap_cap <= 99));
