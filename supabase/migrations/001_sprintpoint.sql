-- supabase/migrations/001_sprintpoint.sql
-- Run this in the Supabase SQL editor or via: supabase db push
-- Creates all tables, RLS policies, and enables Realtime.

-- ─── Extensions ───────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";   -- for gen_random_uuid()

-- ─── Tables ───────────────────────────────────────────────────────────────────

create table if not exists public.rooms (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  description       text,
  host_id           uuid not null,             -- references auth.users(id)
  host_can_vote     boolean not null default true,
  allow_spectators  boolean not null default true,
  locked            boolean not null default false,
  active_ticket_id  uuid,                      -- FK added after tickets table
  revealed          boolean not null default false,
  created_at        timestamptz not null default now()
);

create table if not exists public.members (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.rooms(id) on delete cascade,
  user_id      uuid not null,                  -- Supabase anon auth uid
  name         text not null,
  color        text not null,
  is_host      boolean not null default false,
  is_spectator boolean not null default false,
  joined_at    timestamptz not null default now(),
  unique (room_id, user_id)                    -- one seat per user per room
);

create table if not exists public.tickets (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.rooms(id) on delete cascade,
  title        text not null,
  description  text,
  final_score  text,
  "order"      integer not null default 0,
  created_at   timestamptz not null default now()
);

-- Now add the FK from rooms → tickets (circular reference, safe with deferrable)
alter table public.rooms
  add constraint fk_active_ticket
  foreign key (active_ticket_id)
  references public.tickets(id)
  on delete set null
  deferrable initially deferred;

create table if not exists public.votes (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.rooms(id) on delete cascade,
  ticket_id   uuid not null references public.tickets(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  value       text not null,
  created_at  timestamptz not null default now(),
  unique (ticket_id, member_id)                -- one vote per member per ticket
);

create table if not exists public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.rooms(id) on delete cascade,
  member_id   uuid references public.members(id) on delete set null,
  user_name   text not null,
  user_color  text not null default '#6366f1',
  text        text not null,
  type        text not null default 'chat' check (type in ('chat', 'system')),
  created_at  timestamptz not null default now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
create index if not exists idx_members_room     on public.members(room_id);
create index if not exists idx_members_user     on public.members(user_id);
create index if not exists idx_tickets_room     on public.tickets(room_id);
create index if not exists idx_votes_ticket     on public.votes(ticket_id);
create index if not exists idx_votes_room       on public.votes(room_id);
create index if not exists idx_chat_room        on public.chat_messages(room_id);
create index if not exists idx_chat_created     on public.chat_messages(created_at);

-- ─── Enable RLS on all tables ─────────────────────────────────────────────────
alter table public.rooms          enable row level security;
alter table public.members        enable row level security;
alter table public.tickets        enable row level security;
alter table public.votes          enable row level security;
alter table public.chat_messages  enable row level security;

-- ─── Helper function ──────────────────────────────────────────────────────────
-- Returns the member row for the current user in a given room.
-- Used inside RLS policies so we don't repeat the join everywhere.
create or replace function public.my_member(p_room_id uuid)
returns public.members
language sql
security definer
stable
as $$
  select * from public.members
  where room_id = p_room_id
    and user_id = auth.uid()
  limit 1;
$$;

-- ─── RLS Policies: rooms ──────────────────────────────────────────────────────

-- Anyone (including anon) can browse unlocked rooms
create policy "rooms_select_public"
  on public.rooms for select
  using (not locked or host_id = auth.uid());

-- Any authenticated/anon user can create a room
create policy "rooms_insert_own"
  on public.rooms for insert
  with check (host_id = auth.uid());

-- Only the host can update the room
create policy "rooms_update_host"
  on public.rooms for update
  using (host_id = auth.uid());

-- Only the host can delete the room
create policy "rooms_delete_host"
  on public.rooms for delete
  using (host_id = auth.uid());

-- ─── RLS Policies: members ────────────────────────────────────────────────────

-- Any member of the room can see all members
create policy "members_select_room"
  on public.members for select
  using (
    exists (
      select 1 from public.members m
      where m.room_id = members.room_id
        and m.user_id = auth.uid()
    )
    or
    -- Also allow reading to join (needed before you're a member)
    exists (select 1 from public.rooms r where r.id = members.room_id)
  );

-- Any user can join any unlocked room (insert themselves as a member)
create policy "members_insert_self"
  on public.members for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.rooms r
      where r.id = room_id
        and not r.locked
    )
  );

-- Members can only update their own row (name, color)
create policy "members_update_self"
  on public.members for update
  using (user_id = auth.uid());

-- Members can only delete themselves (leave room)
create policy "members_delete_self"
  on public.members for delete
  using (user_id = auth.uid());

-- ─── RLS Policies: tickets ────────────────────────────────────────────────────

-- Room members can read tickets
create policy "tickets_select_members"
  on public.tickets for select
  using (
    exists (
      select 1 from public.members m
      where m.room_id = tickets.room_id
        and m.user_id = auth.uid()
    )
  );

-- Only host can insert tickets
create policy "tickets_insert_host"
  on public.tickets for insert
  with check (
    exists (
      select 1 from public.rooms r
      where r.id = room_id
        and r.host_id = auth.uid()
    )
  );

-- Only host can update tickets
create policy "tickets_update_host"
  on public.tickets for update
  using (
    exists (
      select 1 from public.rooms r
      where r.id = tickets.room_id
        and r.host_id = auth.uid()
    )
  );

-- Only host can delete tickets
create policy "tickets_delete_host"
  on public.tickets for delete
  using (
    exists (
      select 1 from public.rooms r
      where r.id = tickets.room_id
        and r.host_id = auth.uid()
    )
  );

-- ─── RLS Policies: votes ─────────────────────────────────────────────────────

-- Room members can read votes (but UI hides values until revealed)
create policy "votes_select_members"
  on public.votes for select
  using (
    exists (
      select 1 from public.members m
      where m.room_id = votes.room_id
        and m.user_id = auth.uid()
    )
  );

-- Members can insert their own vote
create policy "votes_insert_self"
  on public.votes for insert
  with check (
    exists (
      select 1 from public.members m
      where m.id = member_id
        and m.user_id = auth.uid()
    )
  );

-- Members can update their own vote
create policy "votes_update_self"
  on public.votes for update
  using (
    exists (
      select 1 from public.members m
      where m.id = votes.member_id
        and m.user_id = auth.uid()
    )
  );

-- Members can delete (retract) their own vote
create policy "votes_delete_self"
  on public.votes for delete
  using (
    exists (
      select 1 from public.members m
      where m.id = votes.member_id
        and m.user_id = auth.uid()
    )
  );

-- ─── RLS Policies: chat_messages ─────────────────────────────────────────────

-- Room members can read chat
create policy "chat_select_members"
  on public.chat_messages for select
  using (
    exists (
      select 1 from public.members m
      where m.room_id = chat_messages.room_id
        and m.user_id = auth.uid()
    )
  );

-- Room members can insert messages
create policy "chat_insert_members"
  on public.chat_messages for insert
  with check (
    exists (
      select 1 from public.members m
      where m.room_id = room_id
        and m.user_id = auth.uid()
    )
    or
    -- System messages have null member_id — only allow from service role
    member_id is null
  );

-- No updates or deletes on chat (immutable log)

-- ─── Realtime ─────────────────────────────────────────────────────────────────
-- Enable Realtime broadcasting for all SprintPoint tables.
-- (Also do this in Dashboard → Database → Replication as a visual double-check)

alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.members;
alter publication supabase_realtime add table public.tickets;
alter publication supabase_realtime add table public.votes;
alter publication supabase_realtime add table public.chat_messages;