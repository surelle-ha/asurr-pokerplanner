# Asurr SprintPoint

> Async-friendly Planning Poker for agile teams — real-time, open source, no account required.

**Live:** [asurr-pokerplanner.vercel.app](https://asurr-pokerplanner.vercel.app) &nbsp;·&nbsp;
**GitHub:** [surelle-ha/asurr-pokerplanner](https://github.com/surelle-ha/asurr-pokerplanner) &nbsp;·&nbsp;
**Support:** [ko-fi.com/surelle](https://ko-fi.com/surelle)

---

## What is this?

Asurr SprintPoint is a free, real-time Planning Poker tool. Teams create a room, drop in their sprint tickets, and vote on story points together — from any device, with no sign-up, no installation, and no cost.

Built and maintained by [@surelle-ha](https://github.com/surelle-ha) as part of the **Asurr** open-source ecosystem.

---

## Features

| Feature | Notes |
|---|---|
| 🃏 Fibonacci card deck | `? 0 1 2 3 5 8 13 21 34 55 ☕` |
| 🎯 Round poker table | Avatars orbit outside, vote cards inside the felt |
| 🔒 Room PIN protection | Optional PIN on room creation |
| 👑 Host management | Pass host to any member; auto-succession on leave |
| 🔑 Rejoin token | Reconnect to your seat from any device |
| 💬 Live team chat | Per-room chat with system messages |
| 😄 Emoji reactions | Real-time broadcast via Supabase Realtime |
| 📤 Export scores | JSON download or printable PDF |
| 🗑️ Auto-purge | All data older than 3 days deleted automatically |
| 🌐 Share via URL / QR | Shareable link + QR code in share modal |
| 👁️ Spectator mode | Join without voting |
| 🔄 Session resume | Refresh without losing your seat |
| ☕ No ads, no paywalls | Free for as long as it can be sustained |

--- 

## To Do List

- Chore: Add `Terms & Condition`.
- Feature: Add `Data Analytics` monitoring.
- Chore: Rename GitHub repository name.
- Feature: Add re-score button on ticket list.
- Chore: Change export button icon.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | [Nuxt 4](https://nuxt.com) + Vue 3 `<script setup>` |
| Styling | Scoped CSS (no Tailwind, no component library) |
| Backend / DB | [Supabase](https://supabase.com) (Postgres + Realtime + Auth) |
| Hosting | [Railway](https://railway.app) |
| Package manager | [pnpm](https://pnpm.io) |
| Monorepo | pnpm workspaces |

---

## Project Structure

```
zenv-agile-scorer/
├── app/                          # Nuxt 4 frontend
│   ├── pages/
│   │   └── index.vue             # Single-page app (all screens in one file)
│   ├── composables/
│   │   ├── useSprintPoint.ts     # All Supabase logic, state, realtime
│   │   └── useSupabaseRealtime.ts
│   └── types/
│       └── sprintpoint.ts        # TypeScript types matching DB schema
├── supabase/
│   ├── migrations/               # SQL files — run manually in Supabase console
│   │   ├── 001_sprintpoint.sql   # Core schema: rooms, members, tickets, votes, chat
│   │   ├── 002_rls_no_auth.sql   # Open RLS policies (no Supabase Auth required)
│   │   ├── 003_add_pin.sql       # Room PIN column
│   │   ├── 004_rejoin_token.sql  # Member rejoin token
│   │   ├── 005_cron_purge.sql    # pg_cron job: delete rooms older than 3 days
│   │   └── 006_last_seen.sql     # Presence heartbeat column + trigger
│   └── functions/
│       └── member-leave/         # Optional Edge Function (not required)
└── package.json
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- A free [Supabase](https://supabase.com) project

### 1. Clone

```bash
git clone https://github.com/surelle-ha/asurr-pokerplanner.git
cd asurr-pokerplanner
pnpm install
```

### 2. Set up Supabase

Create a project at [supabase.com](https://supabase.com), then open the **SQL Editor** and run each migration file in order:

```
supabase/migrations/001_sprintpoint.sql    ← run first
supabase/migrations/002_rls_no_auth.sql
supabase/migrations/003_add_pin.sql
supabase/migrations/004_rejoin_token.sql
supabase/migrations/005_cron_purge.sql     ← requires pg_cron (enable in Extensions)
supabase/migrations/006_last_seen.sql
```

> **pg_cron note:** To enable the auto-purge cron job, go to **Database → Extensions → pg_cron → Enable** before running migration 005.

Also enable **Realtime** for these tables:  
Dashboard → **Database → Replication** → enable for `rooms`, `members`, `tickets`, `votes`, `chat_messages`

### 3. Configure environment

```bash
# app/.env
SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
```

### 4. Run

```bash
pnpm dev
```

App runs at `http://localhost:3000`.

---

## Database Schema

```
rooms
  id, name, description, host_id, host_can_vote, allow_spectators,
  locked, active_ticket_id, revealed, pin, created_at

members
  id, room_id, user_id, name, color, is_host, is_spectator,
  rejoin_token, last_seen, joined_at

tickets
  id, room_id, title, description, final_score, order, created_at

votes
  id, room_id, ticket_id, member_id, value, created_at

chat_messages
  id, room_id, member_id, user_name, user_color, text, type, created_at
```

All child tables cascade-delete when a `room` row is deleted.

---

## How It Works

### No account required

Each browser generates a random UUID stored in `localStorage` (`sp_user_id`). This is the user's identity — no sign-up, no email, no password.

### Rejoin token

When creating or joining a room, users can set a custom **rejoin token** (e.g. `swift-fox-412`). This token is stored per room in `localStorage` and also in the `members.rejoin_token` column. Entering the same token from a different device reconnects to the same seat, preserving vote history and host status.

### Presence

A heartbeat fires every 30 seconds updating `members.last_seen`. Members not seen in the last 90 seconds appear offline (dimmed with strikethrough) in the member list. On page refresh, `resumeSession()` reads the saved session from `localStorage` and reconnects transparently.

### Auto-purge

A `pg_cron` job runs daily at 03:00 UTC and deletes all rooms older than 3 days. All child rows are removed via cascade. This keeps the database clean without any manual intervention.

### RLS

Row-Level Security is enabled on all tables with open `USING (true)` policies. Security is enforced at the application layer — the room code acts as the access token. For production deployments with stricter requirements, swap `002_rls_no_auth.sql` with `001_sprintpoint.sql`'s original `auth.uid()`-based policies and enable Supabase anonymous auth.

---

## Deployment

### Railway (recommended)

1. Push to GitHub
2. Create a new Railway project → deploy from repo
3. Set environment variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY`
4. Railway auto-detects Nuxt and runs `pnpm build` + `pnpm start`

### Vercel / Netlify

Works with any static/SSR host that supports Nuxt. Set the same two env vars.

---

## Contributing

Contributions are welcome. Open an issue or pull request on GitHub.

- 🐛 **Bug reports:** [github.com/surelle-ha/asurr-pokerplanner/issues](https://github.com/surelle-ha/asurr-pokerplanner/issues)
- 💬 **Feature requests:** [github.com/surelle-ha/asurr-pokerplanner/issues/new](https://github.com/surelle-ha/asurr-pokerplanner/issues/new)
- ☕ **Support the project:** [ko-fi.com/surelle](https://ko-fi.com/surelle)

---

## License

MIT — free to use, fork, and self-host.

---

*Built with ☕ by [surelle-ha](https://github.com/surelle-ha)*