-- supabase/migrations/007_member_active.sql
--
-- Adds is_active to members so leaving sets is_active=false instead of
-- deleting the row. This preserves the member.id across sessions so that
-- Realtime UPDATE events on rejoin always match the existing row on other
-- clients — eliminating the stale-ghost / hard-refresh bug.
--
-- On rejoin: UPDATE sets is_active=true on the same row (same id).
-- Realtime fires UPDATE → other clients patch the row in place → name
-- and presence update immediately, no hard refresh required.
--
-- The initial load query filters .eq('is_active', true) so inactive
-- members are never shown to other clients on page load either.

alter table public.members
  add column if not exists is_active boolean not null default true;

create index if not exists idx_members_active
  on public.members (room_id, is_active);

-- Backfill: any existing rows should be considered active
update public.members set is_active = true where is_active is null;