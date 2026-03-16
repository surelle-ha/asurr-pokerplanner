-- supabase/migrations/009_replica_identity.sql
--
-- Supabase Realtime DELETE events only include payload.old when the table
-- has REPLICA IDENTITY set to FULL or at minimum the PK columns.
-- By default Postgres uses REPLICA IDENTITY DEFAULT (PK only), which is
-- sufficient for our use case since we only need row.id to filter DELETE events.
--
-- This migration explicitly confirms the setting and adds it to any table
-- that may have been altered. Run this if DELETE events aren't propagating.

alter table public.tickets  replica identity default;
alter table public.votes    replica identity default;
alter table public.members  replica identity default;
alter table public.rooms    replica identity default;

-- If DELETE events still don't carry the id in payload.old, upgrade to FULL:
-- alter table public.tickets  replica identity full;
-- alter table public.votes    replica identity full;
-- (FULL sends the entire old row but uses more WAL storage)