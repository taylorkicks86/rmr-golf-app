alter table public.weekly_scores
  add column if not exists did_not_finish boolean not null default false;

alter table public.weekly_scores
  alter column gross_score drop not null;

alter table public.weekly_scores
  drop constraint if exists weekly_scores_gross_score_check;

alter table public.weekly_scores
  drop constraint if exists weekly_scores_gross_or_dnf_check;

alter table public.weekly_scores
  add constraint weekly_scores_gross_or_dnf_check
  check (
    (did_not_finish is true and gross_score is null)
    or
    (did_not_finish is false and gross_score > 0 and gross_score < 200)
  );
