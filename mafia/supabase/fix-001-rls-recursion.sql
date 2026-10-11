-- ============================================================
-- Fix 001 — infinite recursion in the row level security policies
--
-- Symptom: reading a room you are definitely a member of returns nothing,
-- so the app says "Can't open this game".
--
-- Cause: the policy on `players` tested membership by selecting from
-- `players`, which re-triggers the same policy. Postgres aborts the query
-- with "infinite recursion detected in policy for relation players", and
-- `rooms_read` hit it too because it also subqueried `players`.
--
-- Fix: do the membership lookup inside SECURITY DEFINER functions. Those
-- bypass RLS internally, so the loop never forms. Safe to run more than once.
--
-- This is already folded into schema.sql; it exists separately so an
-- already-provisioned database can be patched without a full re-run.
-- ============================================================

create or replace function is_member(p_room uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from players where room_id = p_room and user_id = auth.uid()
  );
$$;

create or replace function owns_player(p_player uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from players where id = p_player and user_id = auth.uid()
  );
$$;

grant execute on function is_member(uuid), owns_player(uuid) to authenticated;

drop policy if exists rooms_read on rooms;
create policy rooms_read on rooms for select to authenticated
  using (is_member(rooms.id));

drop policy if exists players_read on players;
create policy players_read on players for select to authenticated
  using (is_member(players.room_id));

drop policy if exists roles_read_own on roles;
create policy roles_read_own on roles for select to authenticated
  using (owns_player(roles.player_id));

drop policy if exists na_read_own on night_actions;
create policy na_read_own on night_actions for select to authenticated
  using (owns_player(night_actions.actor));

drop policy if exists votes_read on votes;
create policy votes_read on votes for select to authenticated
  using (is_member(votes.room_id));

drop policy if exists events_read on events;
create policy events_read on events for select to authenticated
  using (is_member(events.room_id));

drop policy if exists pr_read_own on private_results;
create policy pr_read_own on private_results for select to authenticated
  using (owns_player(private_results.player_id));

drop policy if exists messages_read on messages;
create policy messages_read on messages for select to authenticated
  using (
    is_member(messages.room_id)
    and (messages.channel = 'day' or my_role(messages.room_id) = 'mafia')
  );

notify pgrst, 'reload schema';
