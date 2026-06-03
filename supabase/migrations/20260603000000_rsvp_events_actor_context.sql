alter table public.rsvp_events
  add column if not exists actor_user_id uuid null,
  add column if not exists actor_player_id uuid null references public.players(id) on delete set null,
  add column if not exists actor_role text null;

create index if not exists idx_rsvp_events_actor_created
  on public.rsvp_events(actor_player_id, created_at desc);
