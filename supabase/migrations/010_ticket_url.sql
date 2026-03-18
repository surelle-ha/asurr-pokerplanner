-- supabase/migrations/010_ticket_url.sql
-- Adds optional URL field to tickets (e.g. Jira/Linear/GitHub issue link)
alter table public.tickets
  add column if not exists url text default null;