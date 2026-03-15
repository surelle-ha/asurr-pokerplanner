-- supabase/migrations/002_rls_no_auth.sql
--
-- Replaces the auth.uid()-based RLS from 001_sprintpoint.sql with open policies
-- that allow the anon key to read/write freely.
--
-- This is appropriate for an internal/team tool where:
--   - You trust everyone who has the anon key
--   - Ownership is enforced at the app layer (only members can affect their room)
--   - You are NOT using Supabase Auth (no signInAnonymously, no email/password)
--
-- Run this AFTER 001_sprintpoint.sql — it drops and replaces all policies.

-- ─── Drop all existing policies ───────────────────────────────────────────────

do $$
declare
  r record;
begin
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('rooms','members','tickets','votes','chat_messages')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end
$$;

-- ─── rooms ────────────────────────────────────────────────────────────────────

create policy "rooms_select_all"
  on public.rooms for select using (true);

create policy "rooms_insert_all"
  on public.rooms for insert with check (true);

create policy "rooms_update_all"
  on public.rooms for update using (true);

create policy "rooms_delete_all"
  on public.rooms for delete using (true);

-- ─── members ──────────────────────────────────────────────────────────────────

create policy "members_select_all"
  on public.members for select using (true);

create policy "members_insert_all"
  on public.members for insert with check (true);

create policy "members_update_all"
  on public.members for update using (true);

create policy "members_delete_all"
  on public.members for delete using (true);

-- ─── tickets ──────────────────────────────────────────────────────────────────

create policy "tickets_select_all"
  on public.tickets for select using (true);

create policy "tickets_insert_all"
  on public.tickets for insert with check (true);

create policy "tickets_update_all"
  on public.tickets for update using (true);

create policy "tickets_delete_all"
  on public.tickets for delete using (true);

-- ─── votes ────────────────────────────────────────────────────────────────────

create policy "votes_select_all"
  on public.votes for select using (true);

create policy "votes_insert_all"
  on public.votes for insert with check (true);

create policy "votes_update_all"
  on public.votes for update using (true);

create policy "votes_delete_all"
  on public.votes for delete using (true);

-- ─── chat_messages ────────────────────────────────────────────────────────────

create policy "chat_select_all"
  on public.chat_messages for select using (true);

create policy "chat_insert_all"
  on public.chat_messages for insert with check (true);

-- No update/delete on chat (immutable log)