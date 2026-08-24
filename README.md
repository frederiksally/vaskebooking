# Vaskebooking

A tiny, modern PWA for booking a shared laundry machine, built for the 10
apartments of a Danish _andelsforening_. Neighbors book one-hour slots on a
mobile-first, installable web app and get a push notification before their
slot starts.

It's deliberately small: no user accounts, no third-party auth, no realtime
stack — just a shared building passcode and a signed device cookie for 10
trusted neighbors. Every piece of the stack runs on a free tier.

## Features

- 📅 Book one-hour laundry slots from a mobile-first calendar
- 🔔 Web Push reminder ~30 minutes before your slot
- 👀 Watch a full slot and get notified if it frees up
- 🏠 Apartment-based access via a single shared building passcode
- 📲 Installable PWA (add to home screen) with its own service worker
- ⏱️ Server-enforced rules: max 3h/day, 14-day horizon, no past slots, hours 7–21

## Tech stack

- **[Next.js](https://nextjs.org)** 16 (App Router, TypeScript) on **Vercel**
- **[Neon](https://neon.tech)** Postgres + **[Drizzle ORM](https://orm.drizzle.team)**
- **[web-push](https://github.com/web-push-libs/web-push)** + VAPID keys for Web Push
- **[shadcn/ui](https://ui.shadcn.com)** + Tailwind CSS v4
- Plain `public/sw.js` service worker (per the Next.js PWA guide)
- **[Vitest](https://vitest.dev)** for tests

Everything is $0 at this scale: a single Vercel deploy, a free Neon database,
and a free GitHub Actions cron. No paid features required.

## Getting started

### Prerequisites

- Node.js 20+ and [pnpm](https://pnpm.io)
- A free [Neon](https://console.neon.tech) Postgres database

### 1. Install

```bash
pnpm install
```

### 2. Configure environment

Copy the template and fill in your own values:

```bash
cp .env.example .env.local
```

Generate the secrets:

```bash
# Cookie signing secret
openssl rand -hex 32          # → COOKIE_SECRET

# Cron bearer secret
openssl rand -hex 24          # → CRON_SECRET

# VAPID key pair for Web Push (run once, use the same pair everywhere)
pnpm dlx web-push generate-vapid-keys
# → NEXT_PUBLIC_VAPID_PUBLIC_KEY (public, bundled into the client)
# → VAPID_PRIVATE_KEY (server-only, keep secret)
```

Set `DATABASE_URL` to your Neon **pooled** connection string and pick a
`BUILDING_PASSCODE` your neighbors can remember. See `.env.example` for the
full annotated list.

### 3. Set up the database

```bash
pnpm db:push        # push the Drizzle schema to your database
```

### 4. Run

```bash
pnpm dev            # http://localhost:3000
```

Visit `/`, you'll be redirected to `/onboarding`. Pick an apartment and enter
your `BUILDING_PASSCODE` to sign in.

## Scripts

| Command             | Description                          |
| ------------------- | ------------------------------------ |
| `pnpm dev`          | Start the dev server                 |
| `pnpm build`        | Production build                     |
| `pnpm start`        | Serve the production build           |
| `pnpm lint`         | Run ESLint                           |
| `pnpm test`         | Run the Vitest suite once            |
| `pnpm test:watch`   | Run tests in watch mode              |
| `pnpm db:push`      | Push the Drizzle schema to Postgres  |
| `pnpm db:generate`  | Generate a SQL migration             |
| `pnpm db:migrate`   | Apply migrations                     |

## How auth works

There are no per-user accounts. On first launch a neighbor picks their
apartment and enters the shared `BUILDING_PASSCODE`. The server then sets two
cookies:

- `apartment` — which of the 10 apartments this device belongs to
- `device_id` — a random UUID, signed with `COOKIE_SECRET` (httpOnly)

Bookings are owned by the **apartment**, not the device: any device signed in
as `1. tv` can cancel any `1. tv` booking. All slot rules are enforced
server-side in a single transaction; the UI is only cosmetic.

## Scheduled jobs

Two cron jobs keep things tidy:

- **Reminders** — `/api/cron/reminders`, every 5 minutes. Sends the push
  notification ~30 min before each booked slot. Because Vercel's Hobby (free)
  tier only allows once-per-day cron, this is driven by a GitHub Actions
  workflow (`.github/workflows/cron-reminders.yml`) which is free for public
  repositories.
- **Cleanup** — `/api/cron/cleanup`, daily at 03:00, run by Vercel Cron
  (`vercel.json`). Deletes old bookings, sent reminders, and expired watches.

Both routes require an `Authorization: Bearer <CRON_SECRET>` header.

### Configuring the GitHub Actions reminder cron

The workflow needs two repository secrets (Settings → Secrets and variables →
Actions):

- `APP_URL` — your deployed base URL, e.g. `https://your-app.vercel.app`
- `CRON_SECRET` — the same value set in your Vercel environment

## Deployment

Deploy to [Vercel](https://vercel.com) and set all variables from
`.env.example` in Project Settings → Environment Variables. Vercel Cron picks
up the daily cleanup job from `vercel.json` automatically. Add the two GitHub
Actions secrets above so the 5-minute reminder cron can reach your deployment.

## License

[MIT](./LICENSE) — feel free to reuse this for your own building.
