alter table public.weekly_cup_results
  add column if not exists did_not_finish boolean not null default false;

update public.weekly_cup_results
set did_not_finish = true
where gross_score is null
  and finish_position is not null;
