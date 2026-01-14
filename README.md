# Save One More Person - Market Research MVP

Mobile-first market research app built with Next.js, Supabase, and Recharts. Users swipe through feature cards, give a yes/maybe/no score, and optionally leave a comment + 1-5 rating. An admin portal aggregates insights without exposing raw user identities.

## Tech Stack

- Next.js (App Router, Turbopack-ready)
- Supabase (Postgres + server-only access)
- Recharts (admin dashboards)
- Vercel (deployment)

## Core UX

- Swipe card deck (Tinder-style) with yes/maybe/no gestures and matching buttons.
- One card at a time; stack order randomized per user.
- Feedback lives on the back of the card: flip to write a comment + choose a 1-5 rating.
- Comments and ratings are saved only when the user submits a yes/maybe/no opinion.
- Mobile-first layout, subtle motion, and background image at `public/bkg.png`.

## Getting Started

Install dependencies:

```bash
npm install
```

Create a `.env.local` file (see `.env.local.example`) and set the environment variables.

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Environment Variables

Set these in `.env.local` (or in Vercel project settings):

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_PASSWORD=
```

Note: the Supabase service role key is used only on server routes and should never be exposed as a `NEXT_PUBLIC` variable.

## Supabase Setup

Create a new Supabase project and run the SQL below in the SQL editor.
These statements use case-sensitive table names (`"Features"` and `"Opinions"`).

```sql
create extension if not exists "pgcrypto";

create table if not exists "Features" (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  created_at timestamptz not null default now(),
  description text not null
);

create table if not exists "Opinions" (
  id uuid primary key default gen_random_uuid(),
  feature_id uuid not null references "Features"(id) on delete cascade,
  score int4 not null check (score between 1 and 3),
  rating int4 check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists opinions_feature_id_idx on "Opinions"(feature_id);
create index if not exists opinions_created_at_idx on "Opinions"(created_at);
```

If your `"Features"` table already exists, run:

```sql
alter table "Features"
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists description text not null default '';
```

If your `"Opinions"` table already exists, run:

```sql
alter table "Opinions"
  add column if not exists rating int4 check (rating between 1 and 5);
```

Seed the 19 feature cards (copy/paste the SQL file into the Supabase SQL editor):

```sql
-- run supabase/seed-features.sql
```

Privacy note: the app only stores feature ratings, scores, optional comments, and timestamps. No emails, usernames, device IDs, or analytics are saved.

## API Routes

- `GET /api/features` - list of features (id, name, category, description).
- `POST /api/opinions` - record an opinion `{ featureId, score, rating?, comment? }`.
- `GET /api/admin/summary/feature-ratings` - aggregated counts + averages.
- `GET /api/admin/summary/rating-distribution?featureId=`
- `GET /api/admin/summary/trend?featureId=&bucket=day|week|month`
- `GET /api/admin/comments?featureId=&page=0&limit=5` - paged comments for a feature.

## Admin Portal

- Admin login lives at `/admin/login` and protects `/admin`.
- Middleware blocks unauthorized access to `/admin` and `/api/admin/*`.
- Dashboards show aggregated insights, charts, and feature comments (paged 5 at a time).
- If you stay logged in, the cookie persists; use “Log out” to clear it.

## Design + Assets

- Fonts: Inter (body), Poppins (headings), plus custom fonts in `public/fonts` (e.g. `Faith` and `Golden`).
- Background image: `public/bkg.png`.
- Color palette uses soft sky blues, warm peach, and neutral grays.

## Vercel Deployment

1. Push the repo to GitHub.
2. Import the project into Vercel.
3. Add the environment variables from `.env.local.example` in Vercel.
4. Deploy.

## Notes

- Charts are rendered with Recharts in the admin dashboard.
- Supabase tables are case sensitive: keep `"Features"` and `"Opinions"` exactly.
