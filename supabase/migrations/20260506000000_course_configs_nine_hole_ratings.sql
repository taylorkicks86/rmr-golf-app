alter table public.course_configs
  add column if not exists front_rating numeric null,
  add column if not exists front_slope integer null,
  add column if not exists front_par integer null,
  add column if not exists back_rating numeric null,
  add column if not exists back_slope integer null,
  add column if not exists back_par integer null;

update public.course_configs
set
  front_rating = 33.7,
  front_slope = 119,
  front_par = 35,
  back_rating = 33.3,
  back_slope = 119,
  back_par = 35,
  updated_at = now()
where name = 'Newton Commonwealth Golf Course'
  and tee_name = 'Blue';
