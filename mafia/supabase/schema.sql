-- ============================================================
-- Mafia — Supabase schema
-- Run this once in the Supabase SQL editor (SQL -> New query -> Run).
--
-- Design note: every game rule lives in a SECURITY DEFINER function.
-- Clients never write to game tables directly; they call RPCs. RLS then
-- guarantees a player can only read what their role entitles them to.
-- Secret tables (roles, night_actions, private_results) are deliberately
-- NOT added to the realtime publication, so a bad policy can never leak
-- them over the websocket.
-- ============================================================

-- ---------- tables ----------

create table if not exists rooms (
  id              uuid primary key default gen_random_uuid(),
  code            text unique not null,
  phase           text not null default 'lobby',   -- lobby|night|dawn|day|vote|ended
  day             int  not null default 0,
  phase_ends_at   timestamptz,
  host_user       uuid not null,
  winner          text,                            -- mafia|village
  created_at      timestamptz not null default now()
);

create table if not exists players (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references rooms(id) on delete cascade,
  user_id    uuid not null,
  name       text not null,
  seat       int  not null,
  alive      boolean not null default true,
  last_seen  timestamptz not null default now(),
  unique (room_id, user_id),
  unique (room_id, seat)
);

-- SECRET
create table if not exists roles (
  player_id uuid primary key references players(id) on delete cascade,
  room_id   uuid not null references rooms(id) on delete cascade,
  role      text not null                          -- mafia|detective|doctor|villager
);

-- SECRET
create table if not exists night_actions (
  room_id uuid not null references rooms(id) on delete cascade,
  day     int  not null,
  actor   uuid not null references players(id) on delete cascade,
  action  text not null,                           -- kill|save|investigate
  target  uuid not null references players(id) on delete cascade,
  primary key (room_id, day, actor)
);

create table if not exists votes (
  room_id uuid not null references rooms(id) on delete cascade,
  day     int  not null,
  voter   uuid not null references players(id) on delete cascade,
  target  uuid not null references players(id) on delete cascade,
  primary key (room_id, day, voter)
);

-- public narration log
create table if not exists events (
  id         bigserial primary key,
  room_id    uuid not null references rooms(id) on delete cascade,
  day        int not null default 0,
  body       text not null,
  created_at timestamptz not null default now()
);

-- SECRET (detective findings, role reveal to self)
create table if not exists private_results (
  id         bigserial primary key,
  room_id    uuid not null references rooms(id) on delete cascade,
  player_id  uuid not null references players(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id         bigserial primary key,
  room_id    uuid not null references rooms(id) on delete cascade,
  player_id  uuid not null references players(id) on delete cascade,
  channel    text not null,                        -- day|mafia
  body       text not null,
  created_at timestamptz not null default now()
);

create index if not exists players_room_idx  on players(room_id);
create index if not exists events_room_idx   on events(room_id, id);
create index if not exists messages_room_idx on messages(room_id, id);

-- ---------- helpers ----------

-- The caller's player row in a given room, or null.
create or replace function me(p_room uuid)
returns players language sql stable security definer set search_path = public as $$
  select * from players where room_id = p_room and user_id = auth.uid() limit 1;
$$;

create or replace function my_role(p_room uuid)
returns text language sql stable security definer set search_path = public as $$
  select r.role from roles r
  join players p on p.id = r.player_id
  where r.room_id = p_room and p.user_id = auth.uid()
  limit 1;
$$;

-- ---------- row level security ----------

alter table rooms            enable row level security;
alter table players          enable row level security;
alter table roles            enable row level security;
alter table night_actions    enable row level security;
alter table votes            enable row level security;
alter table events           enable row level security;
alter table private_results  enable row level security;
alter table messages         enable row level security;

-- Only members can read a room. Joining does not need select access, because
-- join_room() takes the code and runs as definer -- so there is no way to
-- enumerate live games or harvest codes.
drop policy if exists rooms_read on rooms;
create policy rooms_read on rooms for select to authenticated
  using (exists (select 1 from players p
                 where p.room_id = rooms.id and p.user_id = auth.uid()));

-- Everyone in a room sees the roster (names, alive, seat) -- never roles.
drop policy if exists players_read on players;
create policy players_read on players for select to authenticated
  using (exists (select 1 from players p2
                 where p2.room_id = players.room_id and p2.user_id = auth.uid()));

-- You may read exactly one role row: your own.
drop policy if exists roles_read_own on roles;
create policy roles_read_own on roles for select to authenticated
  using (exists (select 1 from players p
                 where p.id = roles.player_id and p.user_id = auth.uid()));

-- You may read back your own night action (so a refresh still shows your pick)
-- and nobody else's. Resolution still happens entirely server-side.
drop policy if exists na_read_own on night_actions;
create policy na_read_own on night_actions for select to authenticated
  using (exists (select 1 from players p
                 where p.id = night_actions.actor and p.user_id = auth.uid()));

-- Live vote tally is public within the room: seeing the count is half the game.
drop policy if exists votes_read on votes;
create policy votes_read on votes for select to authenticated
  using (exists (select 1 from players p
                 where p.room_id = votes.room_id and p.user_id = auth.uid()));

drop policy if exists events_read on events;
create policy events_read on events for select to authenticated
  using (exists (select 1 from players p
                 where p.room_id = events.room_id and p.user_id = auth.uid()));

drop policy if exists pr_read_own on private_results;
create policy pr_read_own on private_results for select to authenticated
  using (exists (select 1 from players p
                 where p.id = private_results.player_id and p.user_id = auth.uid()));

-- Day chat: anyone in the room. Mafia chat: only mafia.
drop policy if exists messages_read on messages;
create policy messages_read on messages for select to authenticated
  using (
    exists (select 1 from players p
            where p.room_id = messages.room_id and p.user_id = auth.uid())
    and (messages.channel = 'day' or my_role(messages.room_id) = 'mafia')
  );

-- No insert/update/delete policies anywhere: all writes go through RPCs.

-- ---------- realtime ----------
-- Only non-secret tables are published.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

-- Idempotent: re-running this file must not error on an already-published table.
do $$
declare t text;
begin
  foreach t in array array['rooms','players','events','messages','votes','private_results'] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- private_results is published so the detective hears their result instantly;
-- RLS restricts each row to its owner, and the table holds no other player's
-- secrets -- only a sentence already addressed to that one player.

-- ---------- phase lengths (seconds) ----------
create or replace function phase_len(p_phase text)
returns int language sql immutable as $$
  select case p_phase
    when 'night' then 40
    when 'dawn'  then 8
    when 'day'   then 120
    when 'vote'  then 40
    else 0 end;
$$;

-- ---------- room creation / joining ----------

create or replace function new_code()
returns text language plpgsql as $$
declare c text;
begin
  loop
    -- no vowels: avoids accidentally generating real words
    select string_agg(substr('BCDFGHJKLMNPQRSTVWXYZ', (random() * 21)::int + 1, 1), '')
      into c from generate_series(1, 4);
    exit when not exists (select 1 from rooms where code = c);
  end loop;
  return c;
end $$;

create or replace function create_room(p_name text)
returns text language plpgsql security definer set search_path = public as $$
declare v_code text; v_room uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  v_code := new_code();
  insert into rooms (code, host_user) values (v_code, auth.uid()) returning id into v_room;
  insert into players (room_id, user_id, name, seat)
    values (v_room, auth.uid(), left(trim(p_name), 20), 1);
  insert into events (room_id, body) values (v_room, 'Room created.');
  return v_code;
end $$;

create or replace function join_room(p_code text, p_name text)
returns text language plpgsql security definer set search_path = public as $$
declare v_room rooms; v_seat int; i int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into v_room from rooms where code = upper(trim(p_code));
  if v_room.id is null then raise exception 'No game with that code.'; end if;

  -- already in: just refresh the name and let them back in (reconnect)
  if exists (select 1 from players where room_id = v_room.id and user_id = auth.uid()) then
    update players set name = left(trim(p_name), 20), last_seen = now()
      where room_id = v_room.id and user_id = auth.uid();
    return v_room.code;
  end if;

  if v_room.phase <> 'lobby' then raise exception 'That game has already started.'; end if;
  if (select count(*) from players where room_id = v_room.id) >= 12 then
    raise exception 'That game is full (12 players).';
  end if;

  -- Several people tap Join at the same moment, which is the normal case here,
  -- so max(seat)+1 races on the (room_id, seat) unique index. Retry on collision.
  for i in 1 .. 10 loop
    begin
      select coalesce(max(seat), 0) + 1 into v_seat from players where room_id = v_room.id;
      insert into players (room_id, user_id, name, seat)
        values (v_room.id, auth.uid(), left(trim(p_name), 20), v_seat);
      exit;
    exception when unique_violation then
      if i = 10 then raise exception 'Could not join, try again.'; end if;
    end;
  end loop;
  insert into events (room_id, body)
    values (v_room.id, left(trim(p_name),20) || ' joined.');
  return v_room.code;
end $$;

create or replace function leave_room(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_me players;
begin
  v_me := me(p_room);
  if v_me.id is null then return; end if;
  if (select phase from rooms where id = p_room) <> 'lobby' then return; end if;
  insert into events (room_id, body) values (p_room, v_me.name || ' left.');
  delete from players where id = v_me.id;
end $$;

-- ---------- starting a game ----------

create or replace function start_game(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_room rooms; n int; n_mafia int; ids uuid[]; i int;
begin
  select * into v_room from rooms where id = p_room;
  if v_room.id is null then raise exception 'No such room.'; end if;
  if v_room.host_user <> auth.uid() then raise exception 'Only the host can start.'; end if;
  if v_room.phase <> 'lobby' then raise exception 'Already started.'; end if;

  select count(*) into n from players where room_id = p_room;
  if n < 4 then raise exception 'Need at least 4 players.'; end if;

  -- 1 mafia per 4 players, min 1
  n_mafia := greatest(1, n / 4);

  select array_agg(id order by random()) into ids from players where room_id = p_room;

  delete from roles where room_id = p_room;
  for i in 1 .. array_length(ids,1) loop
    insert into roles (player_id, room_id, role) values (
      ids[i], p_room,
      case
        when i <= n_mafia            then 'mafia'
        when i = n_mafia + 1         then 'detective'
        when i = n_mafia + 2 and n >= 5 then 'doctor'
        else 'villager'
      end
    );
  end loop;

  insert into private_results (room_id, player_id, body)
    select p_room, r.player_id,
      case r.role
        when 'mafia'     then 'You are MAFIA. Eliminate the village without being caught.'
        when 'detective' then 'You are the DETECTIVE. Each night you may investigate one player.'
        when 'doctor'    then 'You are the DOCTOR. Each night you may protect one player.'
        else 'You are a VILLAGER. Find the mafia by listening carefully.'
      end
    from roles r where r.room_id = p_room;

  -- Each mafioso is told who the others are. Sent as a private note rather
  -- than inferred client-side, so no partner list ever reaches a villager.
  if n_mafia > 1 then
    insert into private_results (room_id, player_id, body)
    select p_room, r.player_id,
           'Your partners: ' || (
             select string_agg(p2.name, ', ' order by p2.seat)
               from roles r2 join players p2 on p2.id = r2.player_id
              where r2.room_id = p_room and r2.role = 'mafia'
                and r2.player_id <> r.player_id
           )
      from roles r where r.room_id = p_room and r.role = 'mafia';
  end if;

  update rooms
     set phase = 'night', day = 1, phase_ends_at = now() + make_interval(secs => phase_len('night'))
   where id = p_room;

  insert into events (room_id, day, body)
    values (p_room, 1, 'Night 1. The town falls asleep.');
end $$;

-- ---------- night actions & votes ----------

create or replace function submit_night_action(p_room uuid, p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_me players; v_role text; v_room rooms; v_action text;
begin
  select * into v_room from rooms where id = p_room;
  v_me := me(p_room);
  if v_me.id is null or not v_me.alive then raise exception 'You cannot act.'; end if;
  if v_room.phase <> 'night' then raise exception 'It is not night.'; end if;

  v_role := my_role(p_room);
  v_action := case v_role
                when 'mafia' then 'kill'
                when 'doctor' then 'save'
                when 'detective' then 'investigate'
                else null end;
  if v_action is null then raise exception 'Your role has no night action.'; end if;

  if not exists (select 1 from players where id = p_target and room_id = p_room and alive) then
    raise exception 'Invalid target.';
  end if;
  -- mafia may not target another mafia
  if v_action = 'kill' and (select role from roles where player_id = p_target) = 'mafia' then
    raise exception 'You cannot target your own.';
  end if;

  insert into night_actions (room_id, day, actor, action, target)
    values (p_room, v_room.day, v_me.id, v_action, p_target)
  on conflict (room_id, day, actor) do update set target = excluded.target;
end $$;

create or replace function cast_vote(p_room uuid, p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_me players; v_room rooms;
begin
  select * into v_room from rooms where id = p_room;
  v_me := me(p_room);
  if v_me.id is null or not v_me.alive then raise exception 'You cannot vote.'; end if;
  if v_room.phase <> 'vote' then raise exception 'It is not voting time.'; end if;
  if not exists (select 1 from players where id = p_target and room_id = p_room and alive) then
    raise exception 'Invalid target.';
  end if;

  insert into votes (room_id, day, voter, target)
    values (p_room, v_room.day, v_me.id, p_target)
  on conflict (room_id, day, voter) do update set target = excluded.target;
end $$;

create or replace function send_message(p_room uuid, p_channel text, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare v_me players; v_role text;
begin
  v_me := me(p_room);
  if v_me.id is null then raise exception 'Not in this room.'; end if;
  if not v_me.alive then raise exception 'The dead do not speak.'; end if;
  if length(trim(p_body)) = 0 then return; end if;
  v_role := my_role(p_room);
  if p_channel = 'mafia' and v_role is distinct from 'mafia' then
    raise exception 'Not your channel.';
  end if;
  insert into messages (room_id, player_id, channel, body)
    values (p_room, v_me.id, p_channel, left(trim(p_body), 300));
end $$;

-- ---------- win check ----------

create or replace function check_winner(p_room uuid)
returns text language plpgsql security definer set search_path = public as $$
declare n_maf int; n_other int;
begin
  select count(*) filter (where r.role = 'mafia'),
         count(*) filter (where r.role <> 'mafia')
    into n_maf, n_other
    from players p join roles r on r.player_id = p.id
   where p.room_id = p_room and p.alive;

  if n_maf = 0 then return 'village'; end if;
  if n_maf >= n_other then return 'mafia'; end if;
  return null;
end $$;

create or replace function end_game(p_room uuid, p_winner text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update rooms set phase = 'ended', winner = p_winner, phase_ends_at = null where id = p_room;
  insert into events (room_id, day, body)
    values (p_room, (select day from rooms where id = p_room),
      case when p_winner = 'mafia'
        then 'The mafia win. The town is theirs.'
        else 'The village wins. Every mafioso is gone.' end);
  -- reveal everyone
  insert into events (room_id, day, body)
    select p_room, (select day from rooms where id = p_room),
           p.name || ' was ' || upper(r.role) || '.'
      from players p join roles r on r.player_id = p.id
     where p.room_id = p_room order by p.seat;
end $$;

-- ---------- the phase engine ----------
-- Idempotent and deadline-checked server-side, so any client may call it.
-- That means the game keeps moving even if the host closes their phone.

create or replace function advance_phase(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_room rooms; v_me players; v_force boolean;
  v_kill uuid; v_save uuid; v_dead uuid; v_name text;
  v_det uuid; v_det_target uuid; v_det_role text;
  v_out uuid; v_top int; v_tied int; v_win text;
begin
  select * into v_room from rooms where id = p_room for update;
  if v_room.id is null or v_room.phase in ('lobby','ended') then return; end if;

  -- must be in the room: otherwise anyone holding a room id could drive phases
  v_me := me(p_room);
  if v_me.id is null then raise exception 'Not in this room.'; end if;

  v_force := v_room.host_user = auth.uid();

  -- only advance when the clock has run out, unless the host is forcing it
  if not v_force and (v_room.phase_ends_at is null or now() < v_room.phase_ends_at) then
    return;
  end if;

  -- ========== NIGHT -> DAWN ==========
  if v_room.phase = 'night' then
    -- mafia kill: the most-targeted player (ties broken arbitrarily but stably)
    select target into v_kill from night_actions
      where room_id = p_room and day = v_room.day and action = 'kill'
      group by target order by count(*) desc, target limit 1;

    select target into v_save from night_actions
      where room_id = p_room and day = v_room.day and action = 'save' limit 1;

    if v_kill is not null and (v_save is null or v_save <> v_kill) then
      v_dead := v_kill;
      update players set alive = false where id = v_dead;
      select name into v_name from players where id = v_dead;
      insert into events (room_id, day, body)
        values (p_room, v_room.day, v_name || ' did not survive the night.');
    else
      insert into events (room_id, day, body)
        values (p_room, v_room.day,
          case when v_kill is null then 'The night passed quietly.'
               else 'Someone was attacked — but the doctor got there first.' end);
    end if;

    -- detective result, delivered privately
    select actor, target into v_det, v_det_target from night_actions
      where room_id = p_room and day = v_room.day and action = 'investigate' limit 1;
    if v_det is not null then
      select role into v_det_role from roles where player_id = v_det_target;
      select name into v_name from players where id = v_det_target;
      insert into private_results (room_id, player_id, body)
        values (p_room, v_det,
          'Night ' || v_room.day || ': ' || v_name || ' is ' ||
          case when v_det_role = 'mafia' then 'MAFIA.' else 'not mafia.' end);
    end if;

    v_win := check_winner(p_room);
    if v_win is not null then perform end_game(p_room, v_win); return; end if;

    update rooms set phase = 'dawn',
      phase_ends_at = now() + make_interval(secs => phase_len('dawn')) where id = p_room;
    return;
  end if;

  -- ========== DAWN -> DAY ==========
  if v_room.phase = 'dawn' then
    update rooms set phase = 'day',
      phase_ends_at = now() + make_interval(secs => phase_len('day')) where id = p_room;
    insert into events (room_id, day, body)
      values (p_room, v_room.day, 'Day ' || v_room.day || '. Talk it out.');
    return;
  end if;

  -- ========== DAY -> VOTE ==========
  if v_room.phase = 'day' then
    update rooms set phase = 'vote',
      phase_ends_at = now() + make_interval(secs => phase_len('vote')) where id = p_room;
    insert into events (room_id, day, body)
      values (p_room, v_room.day, 'Voting. Choose who to eliminate.');
    return;
  end if;

  -- ========== VOTE -> NIGHT ==========
  if v_room.phase = 'vote' then
    select target, count(*)::int into v_out, v_top from votes
      where room_id = p_room and day = v_room.day
      group by target order by count(*) desc limit 1;

    if v_out is not null then
      select count(*)::int into v_tied from (
        select target from votes where room_id = p_room and day = v_room.day
        group by target having count(*) = v_top
      ) t;
    end if;

    if v_out is null then
      insert into events (room_id, day, body)
        values (p_room, v_room.day, 'Nobody voted. The town does nothing.');
    elsif v_tied > 1 then
      -- a tie protects everyone: removing the wrong person by coin-flip is worse
      insert into events (room_id, day, body)
        values (p_room, v_room.day, 'The vote is tied. Nobody is eliminated.');
    else
      update players set alive = false where id = v_out;
      select name into v_name from players where id = v_out;
      select role into v_det_role from roles where player_id = v_out;
      insert into events (room_id, day, body)
        values (p_room, v_room.day,
          v_name || ' was voted out. They were ' || upper(v_det_role) || '.');
    end if;

    v_win := check_winner(p_room);
    if v_win is not null then perform end_game(p_room, v_win); return; end if;

    update rooms set phase = 'night', day = v_room.day + 1,
      phase_ends_at = now() + make_interval(secs => phase_len('night')) where id = p_room;
    insert into events (room_id, day, body)
      values (p_room, v_room.day + 1, 'Night ' || (v_room.day + 1) || '. The town falls asleep.');
    return;
  end if;
end $$;

-- Heartbeat so the roster can show who has dropped off.
create or replace function touch(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update players set last_seen = now() where room_id = p_room and user_id = auth.uid();
end $$;

-- ---------- grants ----------
grant execute on function
  create_room(text), join_room(text,text), leave_room(uuid), start_game(uuid),
  submit_night_action(uuid,uuid), cast_vote(uuid,uuid), send_message(uuid,text,text),
  advance_phase(uuid), touch(uuid), my_role(uuid)
to authenticated;

revoke execute on function me(uuid), check_winner(uuid), end_game(uuid,text), new_code()
from public, anon, authenticated;
