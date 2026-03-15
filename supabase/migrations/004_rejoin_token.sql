-- supabase/migrations/004_rejoin_token.sql
-- Adds rejoin_token to members so a user can reconnect to their seat
-- without creating a duplicate row.

alter table public.members
  add column if not exists rejoin_token text default null;

-- A token must be unique within a room but can repeat across rooms
create unique index if not exists idx_members_room_token
  on public.members (room_id, rejoin_token)
  where rejoin_token is not null;