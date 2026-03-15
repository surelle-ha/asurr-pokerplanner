-- supabase/migrations/003_add_pin.sql
-- Adds optional PIN protection to rooms.
alter table public.rooms add column if not exists pin text default null;