create or replace function public.get_weekly_leaderboard(p_league_week_id uuid)
returns table (
  full_name text,
  gross_score integer,
  rank_position bigint,
  points numeric
)
language sql
as $$
  with ranked_scores as (
    select
      ws.player_id,
      ws.gross_score,
      rank() over (
        partition by ws.league_week_id
        order by ws.gross_score asc
      ) as rank_position
    from public.weekly_scores ws
    where ws.league_week_id = p_league_week_id
  )
  select
    p.full_name,
    rs.gross_score,
    rs.rank_position,
    lp.points
  from ranked_scores rs
  join public.players p
    on p.id = rs.player_id
  left join public.league_points lp
    on lp.position = rs.rank_position
  order by rs.gross_score asc, p.full_name;
$$;