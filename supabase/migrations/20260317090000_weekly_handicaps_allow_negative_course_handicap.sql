do $$
declare
  course_constraint text;
  final_constraint text;
begin
  select con.conname
    into course_constraint
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'weekly_handicaps'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%course_handicap%';

  if course_constraint is not null then
    execute format('alter table public.weekly_handicaps drop constraint %I', course_constraint);
  end if;

  alter table public.weekly_handicaps
    add constraint weekly_handicaps_course_handicap_check
    check (
      course_handicap >= -20
      and course_handicap <= 99
      and course_handicap = trunc(course_handicap)
    );

  select con.conname
    into final_constraint
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'weekly_handicaps'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%final_computed_handicap%';

  if final_constraint is not null then
    execute format('alter table public.weekly_handicaps drop constraint %I', final_constraint);
  end if;

  alter table public.weekly_handicaps
    add constraint weekly_handicaps_final_computed_handicap_check
    check (final_computed_handicap >= -20 and final_computed_handicap <= 99);
end
$$;
