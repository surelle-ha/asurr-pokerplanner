-- supabase/migrations/008_enable_leaderboard.sql
-- Adds enable_leaderboard flag to rooms.
-- When true, the leaderboard modal is available to the host.
-- Leaderboard data is computed client-side from existing votes + tickets tables.

alter table public.rooms
  add column if not exists enable_leaderboard boolean not null default false;