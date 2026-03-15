-- supabase/migrations/006_last_seen.sql
-- Adds last_seen timestamp to members for presence detection.
-- Members not seen in the last 2 minutes are treated as disconnected by the UI.
-- The nightly cron already purges rooms; this column just helps the UI show
-- who is currently active vs. who has gone away.

alter table public.members
  add column if not exists last_seen timestamptz default now();

-- Update last_seen when any member row is touched (login/rejoin)
create or replace function public.touch_member_seen()
returns trigger language plpgsql as $$
begin
  new.last_seen := now();
  return new;
end;
$$;

drop trigger if exists trg_member_seen on public.members;
create trigger trg_member_seen
  before update on public.members
  for each row execute function public.touch_member_seen();