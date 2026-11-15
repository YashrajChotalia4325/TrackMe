# TrackMe

**Build yourself, one day at a time.** A personal growth operating system for academics, career, AI learning, MBA profile building, fitness, creative work and finances — with an adaptive, deterministic scheduling engine.

## Stack

Next.js 16 (App Router, Server Actions) · TypeScript (strict) · Tailwind CSS 4 · shadcn/ui (Base UI) · 21st.dev components (Animated Sidebar, Circular Progress) · Prisma 7 + PostgreSQL · Better Auth (email/password) · Recharts · React Hook Form + Zod · date-fns · Sonner · Vitest.

No external AI API is used — scheduling is fully deterministic.

## Getting started (no Docker required)

```bash
npm install
cp .env.example .env          # then set BETTER_AUTH_SECRET and seed credentials
npx prisma dev --name trackme # local Postgres; keep this terminal open, copy its TCP URL into DATABASE_URL
npx prisma migrate deploy
npm run db:seed               # creates the owner account + initial configuration
npm run dev                   # http://localhost:3000
```

> `prisma dev` runs an embedded Postgres (PGlite) and is convenient but **not reliable for daily use** — on Windows it has been observed to exit under normal page traffic. For everyday use, point `DATABASE_URL` at a real PostgreSQL: a free [Neon](https://neon.tech) database (also what you'd use on Vercel) or a native [PostgreSQL for Windows](https://www.postgresql.org/download/windows/) install, set `DATABASE_POOL_MAX="5"`, then run `npm run db:setup` (migrations + seed). With Neon, use the **pooled** connection string for `DATABASE_URL` and the **direct** one for `DIRECT_URL`.

You can also skip the seed and register in the app — the first account receives the initial profile, the known exam period (23 Nov – 3 Dec 2026) and the long-term goals.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `start` | Production build / server |
| `npm test` | Unit tests (scheduling engine, scoring) |
| `npm run typecheck` / `lint` | Static checks |
| `npm run db:migrate` | Create a new migration (dev) |
| `npm run db:deploy` | Apply migrations |
| `npm run db:seed` | Seed owner account + configuration |
| `npm run db:studio` | Browse the database |

## Personalization

Settings has two tabs for making TrackMe fit your week:

- **Day rhythm** — *day templates* (e.g. "College day" Mon–Fri, "Weekend"; each with its own wake/sleep time, focus hours, task limit and an optional *rest day* flag), per-date overrides (e.g. an "Exam day"), *protected time* the planner never touches (family dinner, commute), and *energy windows* per category (**Prefer** = put this work here when possible, **Avoid** = never auto-schedule it here). All of these feed the scheduling engine.
- **Personalize** — your personal "why" (shown on the dashboard), dashboard panel order and visibility, and your start page (Dashboard or My Day).

**Habits** (Personal page → Habits, ticked on My Day or the dashboard) are quick daily check-ins with streaks. They are deliberately *not* part of the daily score.

## Integrations (optional, read-only)

All integrations live on the **Integrations** page and can be disconnected at any time. TrackMe never sends, posts, labels or edits anything.

### Google Calendar & Gmail
1. In [Google Cloud Console](https://console.cloud.google.com) create a project, then enable the **Google Calendar API** and the **Gmail API**.
2. OAuth consent screen: user type *External*, status *Testing*; add your own Google account as a test user; add the scopes `calendar.readonly` and `gmail.readonly`.
3. Credentials → Create OAuth client ID → *Web application*. Authorised redirect URI: `http://localhost:3000/api/auth/callback/google` (plus your production URL).
4. Set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `.env`, restart, then click **Connect Calendar** / **Connect Gmail**.

Calendar events (7 days back → 60 days ahead) sync every 30 min and become fixed commitments the scheduler plans around. Gmail is scanned hourly for interview, assessment, offer, application and college-deadline emails; only the sender, subject and Gmail's short snippet are stored, as suggestions you accept (add to calendar / update a job application) or dismiss.

### GitHub
1. GitHub → Settings → Developer settings → OAuth Apps → **New OAuth App**. Homepage `http://localhost:3000`, callback `http://localhost:3000/api/auth/callback/github`.
2. Generate a client secret; set `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`; restart; click **Connect**.
3. Tip: enable "Include private contributions on my profile" in your GitHub profile settings.

Daily contributions, PRs, reviews and repos appear on the AI & Technology page as context — never counted as learning time.

### ChatGPT & Claude
Neither offers an API for personal chat history, so use their data exports: ChatGPT → Settings → Data controls → Export data; Claude → Settings → Privacy → Export data. Unzip and upload `conversations.json` on the Integrations page. The file is parsed **in your browser**; only per-day counts and conversation titles are saved.

### Social media
Instagram, X and LinkedIn don't offer personal-use APIs for your own activity (or charge for them), so they aren't integrated. Use the Career networking log for LinkedIn outreach.

## Deploying to Vercel

1. Create a hosted Postgres (Neon, Supabase or Prisma Postgres) and set `DATABASE_URL` (pool size 5–10).
2. Set `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` to your production URL.
3. Build command: `npm run build` (runs `prisma generate`). Run `npm run db:deploy` against the production database once per migration.
4. After registering your account, set `ALLOW_SIGNUP=false`.

## Architecture

```
src/
  app/                    routes — (auth) login/register, onboarding, (app) all product pages
  components/             UI: shell (sidebar/header), tasks, calendar, planner, trackers, charts, ui (shadcn + 21st.dev)
  lib/
    time.ts               timezone-safe date helpers (dates = YYYY-MM-DD, times = minutes from midnight)
    domain/               pure business logic — scheduler, scoring, achievements, constants (unit-tested)
  server/
    actions/              server actions (all inputs validated with Zod, all scoped to the signed-in user)
    queries.ts, reports.ts read models for pages and reports
    schedule-context.ts   builds engine input from timetable, work hours, events and tasks
    maintenance.ts        missed-task sweep, recurring task generation, notifications, achievements
prisma/                   schema, migrations, seed
```

### Scheduling engine (`src/lib/domain/scheduler.ts`)

Pure functions that return **proposals**; nothing is written until you approve.

- **Reschedule My Day** — re-packs incomplete work into the rest of today, spreads overflow across the remaining week (the day with most capacity, never just "tomorrow"), skips optional work without creating backlog, never moves fixed commitments, and reports anything that cannot fit.
- **Conflict resolution** — adding a blocking event proposes moves for clashing flexible tasks; fixed ones are flagged for approval.
- **Weekly planning** — places recurring commitments, carries over missed work, and fills weekly targets (prorated for partial weeks) by mode priorities, respecting gym days, exam periods and daily caps.
- **Invariants** — never outside wake→sleep, minimum rest gap between blocks, daily focus-minute and task-count caps, explicit warnings when a target can't be met.
- **Learning from history** — if tasks after 9 PM are completed much less often, new sessions are placed earlier.
- Applying a proposal runs in one transaction, writes an audit trail (`ScheduleChange`) and can be **undone**.

### Scoring (`src/lib/domain/scoring.ts`)

Mode-specific category weights; categories with no tasks that day have their weight redistributed; partial credit; approved skips and pending optional tasks never count against you. Each `DailyScore` stores a snapshot of its weights so editing weights never rewrites history.

## Notes

- Timezone defaults to Asia/Kolkata; all "today" logic uses the user's timezone.
- Timetable import: CSV with `day,start,end,subject,location,type` (Excel → Save As CSV).
- Personal details not provided (lecture times, work hours, exam papers, salary, measurements) are collected in onboarding — nothing is invented.
