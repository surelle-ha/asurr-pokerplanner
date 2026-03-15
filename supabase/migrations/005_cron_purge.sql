-- supabase/migrations/005_cron_purge.sql
-- Purges rooms (and all their cascade-deleted children) older than 3 days.
-- Uses pg_cron which is built into every Supabase project.
--
-- Enable the extension first if not already active:
--   Dashboard → Database → Extensions → pg_cron → Enable
--
-- What gets deleted:
--   rooms older than 3 days → cascade deletes:
--     members, tickets, votes, chat_messages  (all have ON DELETE CASCADE)

-- 1. Enable pg_cron (idempotent — safe to run if already enabled)
create extension if not exists pg_cron;

-- 2. Grant cron to postgres role (required by Supabase)
grant usage on schema cron to postgres;

-- 3. Schedule the purge job — runs every day at 03:00 UTC
--    Unschedule any old version of the job first so this migration is idempotent
select cron.unschedule('purge-old-rooms') where exists (
  select 1 from cron.job where jobname = 'purge-old-rooms'
);

select cron.schedule(
  'purge-old-rooms',              -- job name
  '0 3 * * *',                    -- cron expression: every day at 03:00 UTC
  $$
    delete from public.rooms
    where created_at < now() - interval '3 days';
  $$
);

-- 4. Verify the job was registered
-- select * from cron.job where jobname = 'purge-old-rooms';

-- NOTE: If pg_cron is not available on your Supabase plan, use the
-- Supabase Edge Function approach instead (see 005b_purge_edge_function.md).