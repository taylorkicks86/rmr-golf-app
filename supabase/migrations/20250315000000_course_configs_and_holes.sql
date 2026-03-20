create table if not exists public.course_configs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tee_name text not null,
  total_par integer not null,
  total_yards integer null,
  rating numeric null,
  slope integer null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.course_configs
drop constraint if exists course_configs_name_tee_name_unique;

alter table public.course_configs
add constraint course_configs_name_tee_name_unique unique (name, tee_name);

create unique index if not exists idx_course_configs_single_default
  on public.course_configs (is_default)
  where is_default = true;

create table if not exists public.course_holes (
  id uuid primary key default gen_random_uuid(),
  course_config_id uuid not null references public.course_configs(id) on delete cascade,
  hole_number integer not null check (hole_number between 1 and 18),
  side text not null check (side in ('front', 'back')),
  par integer not null,
  stroke_index integer not null check (stroke_index between 1 and 18),
  yards integer null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_config_id, hole_number),
  unique (course_config_id, stroke_index)
);

create index if not exists idx_course_holes_course_side_hole
  on public.course_holes (course_config_id, side, hole_number);

alter table public.league_weeks
add column if not exists course_config_id uuid references public.course_configs(id) on delete set null;

create index if not exists idx_league_weeks_course_config_id
  on public.league_weeks(course_config_id);

do $$
declare
  v_course_id uuid;
begin
  insert into public.course_configs (
    name,
    tee_name,
    total_par,
    total_yards,
    rating,
    slope,
    is_default
  )
  values (
    'Newton Commonwealth Golf Course',
    'Blue',
    70,
    5354,
    67.0,
    119,
    true
  )
  on conflict (name, tee_name) do update
  set
    total_par = excluded.total_par,
    total_yards = excluded.total_yards,
    rating = excluded.rating,
    slope = excluded.slope,
    is_default = true,
    updated_at = now()
  returning id into v_course_id;

  if v_course_id is null then
    select id into v_course_id
    from public.course_configs
    where name = 'Newton Commonwealth Golf Course'
      and tee_name = 'Blue'
    limit 1;
  end if;

  update public.course_configs
  set is_default = false
  where id <> v_course_id
    and is_default = true;

  insert into public.course_holes (course_config_id, hole_number, side, par, stroke_index, yards)
  values
    (v_course_id, 1, 'front', 4, 15, 277),
    (v_course_id, 2, 'front', 5, 1, 533),
    (v_course_id, 3, 'front', 3, 5, 193),
    (v_course_id, 4, 'front', 3, 17, 129),
    (v_course_id, 5, 'front', 5, 3, 455),
    (v_course_id, 6, 'front', 4, 9, 276),
    (v_course_id, 7, 'front', 3, 11, 177),
    (v_course_id, 8, 'front', 5, 7, 488),
    (v_course_id, 9, 'front', 3, 13, 210),
    (v_course_id, 10, 'back', 4, 14, 276),
    (v_course_id, 11, 'back', 4, 6, 307),
    (v_course_id, 12, 'back', 3, 12, 159),
    (v_course_id, 13, 'back', 4, 16, 268),
    (v_course_id, 14, 'back', 4, 10, 247),
    (v_course_id, 15, 'back', 5, 8, 451),
    (v_course_id, 16, 'back', 3, 18, 152),
    (v_course_id, 17, 'back', 4, 2, 378),
    (v_course_id, 18, 'back', 4, 4, 378)
  on conflict (course_config_id, hole_number) do update
  set
    side = excluded.side,
    par = excluded.par,
    stroke_index = excluded.stroke_index,
    yards = excluded.yards,
    updated_at = now();

  update public.league_weeks
  set course_config_id = v_course_id
  where course_config_id is null;
end $$;
