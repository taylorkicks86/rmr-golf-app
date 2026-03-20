alter table public.weekly_scores
add column if not exists is_scorecard_signed boolean not null default false,
add column if not exists scorecard_signed_at timestamptz null;

create index if not exists idx_weekly_scores_signed_state
  on public.weekly_scores (league_week_id, is_scorecard_signed);
