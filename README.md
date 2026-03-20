# RMR Golf League

A Next.js golf league management app with Supabase auth and database.

## Setup

1. **Install dependencies** (already done if you cloned after creation)
   ```bash
   npm install
   ```

2. **Configure Supabase**
   - Create a project at [supabase.com](https://supabase.com).
   - In the dashboard: **Settings → API** copy your project URL and anon key.
   - Copy `.env.local.example` to `.env.local` and fill in:
     ```
     NEXT_PUBLIC_SUPABASE_URL=your-project-url
     NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
     ```

3. **Run locally**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000).

## Features

- **Login** — Email/password auth via Supabase at `/login`
- **Admin** — `/admin` — league settings and management
- **Weekly Leaderboard** — `/leaderboard` — week standings
- **Score Entry** — `/score-entry` — submit round scores
- **Player Profiles** — `/players` and `/players/[id]` — roster and profiles

## Stack

- Next.js 16 (App Router), TypeScript, Tailwind CSS
- Supabase (auth + database)
