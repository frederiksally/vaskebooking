# Vaskebooking — Design Spec

**Date:** 2026-05-17
**Audience:** the 10 apartments of one Danish andelsforening
**Goal:** a tiny, modern PWA where neighbors book 1-hour slots on the shared laundry machine, mobile-first, installable, with push notifications.

---

## 1. Architecture

**Stack**
- Next.js 16 (App Router, TypeScript, Tailwind) on Vercel
- Neon Postgres + Drizzle ORM
- Plain `public/sw.js` service worker (per Next.js official PWA guide)
- `web-push` npm lib + VAPID keys for Web Push
- Vercel Cron for scheduled jobs
- shadcn/ui base + smart blocks from shadcnstudio.com (e.g. `@ss-components/calendar-24`)

**Why this stack:** every piece is $0 at this scale, single deploy target, no third-party SDKs beyond `web-push`. Supabase was considered and dropped — RLS, auth, and realtime all add weight we don't need for 10 trusted neighbors.

**Why no Serwist / next-pwa:** offline support is descoped to v1. Plain `sw.js` from the [Next.js PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps) handles `push` + `notificationclick` in ~30 lines. `next-pwa` is in maintenance mode (author recommends migrating to Serwist). Serwist is great but only worth it for offline shell caching, which we're not doing.

**File tree**
```
app/
  manifest.ts                    # Next.js typed manifest
  layout.tsx                     # metadata, theme-color, sw register
  page.tsx                       # Home: calendar + slots
  bookings/page.tsx              # My bookings + Watching
  settings/page.tsx              # apartment, push, install
  onboarding/page.tsx            # apartment + passcode
  actions/
    auth.ts                      # login, change-apartment, logout
    bookings.ts                  # create, cancel, list
    push.ts                      # subscribe, unsubscribe, toggle, watch slot
  api/cron/
    reminders/route.ts           # every 5 min
    cleanup/route.ts             # daily 03:00
public/
  sw.js                          # ~30 lines: push + notificationclick
  icons/icon-192.png, icon-512.png, icon-maskable-512.png
db/
  schema.ts                      # drizzle tables
  index.ts                       # drizzle client
lib/
  apartments.ts                  # the 10 + colors
  auth.ts                        # cookie helpers
  push.ts                        # web-push wrapper
  validation.ts                  # 3h/day, horizon, no-past
  time.ts                        # tz-aware helpers (Europe/Copenhagen)
next.config.ts                   # security headers (sw.js + global)
drizzle.config.ts
vercel.json                      # cron schedules
```

**Auth model**
- First launch → `/onboarding`: pick apartment + enter shared passcode (`BUILDING_PASSCODE` env var).
- Server validates → sets two cookies:
  - `apartment` (httpOnly: false, so client UI can read) — one of the 10 strings
  - `device_id` (httpOnly: true, signed) — random UUID
- All booking/subscription routes read `apartment` from the cookie and trust it.
- **Apartment owns bookings** (decided in brainstorming): any device signed in as `1. tv` can cancel any `1. tv` booking. `device_id` is kept on `push_subscriptions` only, so we know which device gets the push. It is **not** stored on `bookings`.

**Trust boundary**
All slot rules (uniqueness, 3h/day, 14-day horizon, no past, hour 7–21) are enforced server-side in a single transaction. UI-side disabling is purely cosmetic.

---

## 2. Data model (Drizzle / Postgres)

```ts
// db/schema.ts
import { pgTable, uuid, text, date, smallint, timestamp, boolean, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const APARTMENTS = [
  'St. tv', 'St. th',
  '1. tv', '1. th',
  '2. tv', '2. th',
  '3. tv', '3. th',
  '4. tv', '4. th',
] as const
export type Apartment = (typeof APARTMENTS)[number]

export const bookings = pgTable('bookings', {
  id: uuid().defaultRandom().primaryKey(),
  apartment: text().notNull(),       // one of APARTMENTS
  date: date().notNull(),            // YYYY-MM-DD, Europe/Copenhagen
  hour: smallint().notNull(),        // 7..21 (slot start hour)
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  slotUnique: uniqueIndex('booking_slot_unique').on(t.date, t.hour),
  apartmentDateIdx: index().on(t.apartment, t.date),
}))

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid().defaultRandom().primaryKey(),
  apartment: text().notNull(),
  deviceId: text().notNull(),
  endpoint: text().notNull().unique(),
  p256dh: text().notNull(),
  auth: text().notNull(),
  reminderEnabled: boolean().default(true).notNull(),
  freedSlotEnabled: boolean().default(true).notNull(),  // master switch
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
})

export const slotWatches = pgTable('slot_watches', {
  id: uuid().defaultRandom().primaryKey(),
  apartment: text().notNull(),
  deviceId: text().notNull(),
  date: date().notNull(),
  hour: smallint().notNull(),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  watchUnique: uniqueIndex('watch_unique').on(t.deviceId, t.date, t.hour),
  slotIdx: index().on(t.date, t.hour),  // fast lookup of watchers for a freed slot
}))

export const reminderJobs = pgTable('reminder_jobs', {
  bookingId: uuid().primaryKey().references(() => bookings.id, { onDelete: 'cascade' }),
  fireAt: timestamp({ withTimezone: true }).notNull(),
  sentAt: timestamp({ withTimezone: true }),  // null = pending
}, (t) => ({
  pendingIdx: index('reminder_pending_idx').on(t.fireAt).where(sql`sent_at is null`),
}))
```

**Notes**
- All `date`/`hour` values are interpreted in `Europe/Copenhagen`. Storing as DATE + smallint (not timestamp) makes DST a non-issue at the data layer; the cron job converts to UTC at fire time using `formatInTimeZone`.
- No user table. Apartment + signed `device_id` cookie = identity.
- `reminder_jobs` is a separate table so the 5-min cron can find ready-to-fire reminders by indexed scan rather than scanning all future bookings.
- Slot watches are unique per `(deviceId, date, hour)` — the same apartment on two devices gets two notifications when a watched slot frees up. That matches the user's intent: "tell me on this device."

---

## 3. Booking & cancellation flow

### `createBooking(date, hour)` — server action

Atomic transaction:
1. Read user's bookings for `date` and apartment. If `>= 3` → throw `MAX_3H_PER_DAY`.
2. Validate `date` and `hour`:
   - `hour` in `[7, 21]` → else `OUT_OF_HOURS`
   - slot start (in Europe/Copenhagen) is in the future → else `PAST_SLOT`
   - `date` ≤ today + 14 days → else `HORIZON_EXCEEDED`
3. Insert into `bookings`. Unique constraint on `(date, hour)` catches double-book → translate `23505` to `SLOT_TAKEN`.
4. Compute `fireAt = (date hour 00:00 Europe/Copenhagen) - 30 min` → UTC. Insert into `reminder_jobs`.
5. Commit.

### `cancelBooking(bookingId)` — server action

Atomic transaction:
1. Delete from `bookings` where `id = ? AND apartment = ?` (apartment from cookie). If no row affected → `NOT_FOUND_OR_NOT_YOURS`.
2. `reminder_jobs` row cascades on FK delete.
3. Find watchers for that `(date, hour)`, excluding the cancelling apartment.
4. Delete those watch rows in the same transaction (consume — first-come-first-served avoids re-firing if someone re-books).
5. Commit.
6. **After commit:** `Promise.allSettled` over watchers, send `freed` push to each. Push errors are non-fatal (the cancel already succeeded).

### Watching rules
- Watching ≠ booking. Watches do **not** count toward the 3h/day cap.
- You cannot watch your own apartment's booking — the UI hides the button, and the server action rejects with `OWN_APARTMENT`.
- You can watch a slot on a day where you already have 3 bookings.
- A user can watch unlimited slots.
- Once a watched slot's start time passes, daily cleanup deletes the watch.

### Push sending semantics
- `webpush.sendNotification` returning 404 or 410 → delete that subscription row.
- All other errors → log and continue. We never block a booking action on push.

---

## 4. Screens

### `/onboarding`

Centered card. 5×2 grid of apartment buttons (each shows its color dot). Numeric passcode input below. "Log ind" submits. On wrong passcode: input shakes + sonner toast "Forkert kode."

### `/` — Home / Calendar

Adapted from shadcnstudio's `calendar-24`:
- **Desktop:** month calendar on left, day's slot list on right.
- **Mobile:** horizontal 7-day strip on top, slot list fills the rest.
- Time slots: 1-hour blocks 07:00–22:00.
- Calendar dates that are fully booked show with strikethrough. Today highlighted.

Slot states:
| State | Visual | Tap action |
|-------|--------|------------|
| Ledig | Solid button | Open booking confirm |
| Optaget (other apt) | Disabled, shows booker label + color dot | Open watch drawer |
| Din | Accent color | Open cancel confirm |
| Forbi | Greyed out | No-op |
| Maxed today | Solid but greyed | Toast "Du har allerede booket 3 timer i dag" |

Top-of-day banner: "Du har 1 booking i dag kl. 18:00" / "Ingen bookinger i dag."

### Drawers / Dialogs (Drawer on mobile, Dialog on desktop)

**Booking confirm:**
> Book vasketid?
> Tirsdag 19. maj, kl. 14:00–15:00
> for **1. tv**
>
> [Annuller] [Bekræft booking]

**Cancel confirm:**
> Annullér booking?
> Tirsdag 19. maj, kl. 14:00–15:00
> Naboer der venter på denne tid får besked hvis du annullerer.
>
> [Behold] [Annullér booking]

**Slot watch:**
> 14:00–15:00 er booket af 1. tv
> Få push-besked hvis tiden bliver ledig?
>
> [Luk] [Giv mig besked]
>
> If push not yet enabled, this also triggers permission + subscription flow before creating the watch.

### `/bookings`

Three sections (collapsible):
1. **Mine bookinger** — upcoming for this apartment. Each row: date · time · `[Annullér]`. Empty: "Ingen kommende bookinger."
2. **Vagter** — watched slots. Each row: date · time · "booket af 2. th" · `[Stop]`. Empty when none.
3. **Historik** (collapsed by default) — past bookings, last 30 days, read-only.

### `/settings`

- **Lejlighed**: shows current. `[Skift lejlighed]` opens picker → re-validates passcode → updates cookie.
- **Notifikationer**:
  - Toggle: *Påmindelse 30 min før vasketid* (`reminderEnabled`)
  - Toggle: *Besked når vagtede tider bliver ledige* (`freedSlotEnabled` — master switch). When OFF, watches stay in DB but no `freed` pushes are sent. When flipped back ON, they resume.
  - On iOS Safari + not standalone: toggles disabled with "Tilføj til hjemmeskærm først · [Vis hvordan]" → opens 3-step instructions sheet.
  - On unsupported browsers: toggles hidden with "Push-notifikationer kræver en moderne browser."
- **App**:
  - `[Tilføj til hjemmeskærm]` — captures `beforeinstallprompt` on Android/desktop Chromium. On iOS shows the iOS share-sheet instructions. Hidden when already in `display-mode: standalone`.
- **Om**: app version, "Log ud" (clears cookies → onboarding).

### Vibe / design

- Danish-first UI copy. `da-DK` locale for dates, day names, month names.
- Single accent color (warm orange or soft teal — pick during ui implementation).
- System dark mode + manual override.
- Per-apartment deterministic color (10 distinct hues, accessible contrast on both modes).
- Big tap targets (min 44px), generous spacing.
- Sonner toasts for confirmations, skeleton loader on slot list.

---

## 5. Push notifications

### VAPID
- Generated once via `web-push generate-vapid-keys`.
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (client) + `VAPID_PRIVATE_KEY` (server, never exposed).
- Set on server boot via `webpush.setVapidDetails('mailto:admin@example.com', pub, priv)`.

### Service worker (`public/sw.js`)

```js
self.addEventListener('push', (e) => {
  const { title, body, url, tag } = e.data.json()
  e.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge.png',
    data: { url },
    tag,                       // dedupes (e.g. don't stack 5 reminders)
    vibrate: [100, 50, 100],
  }))
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = e.notification.data?.url ?? '/'
  e.waitUntil(clients.matchAll({ type: 'window' }).then((wins) => {
    const existing = wins.find((w) => w.url.includes(self.location.origin))
    return existing ? existing.focus().then(() => existing.navigate(url)) : clients.openWindow(url)
  }))
})
```

### Subscription lifecycle
1. User toggles push on → browser permission prompt → `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`.
2. Client POSTs `{endpoint, keys: {p256dh, auth}}` to `subscribeUser` server action; server upserts on `endpoint` (unique).
3. On unsubscribe: server delete + `subscription.unsubscribe()` client-side.
4. **Stale endpoints:** any `webpush.sendNotification` returning 404/410 deletes that row inline.

### Payloads
```ts
type Payload =
  | { kind: 'reminder';
      title: 'Vasketid om 30 min';
      body: string;            // "Din vasketid 14:00–15:00 starter snart"
      url: '/bookings';
      tag: `reminder:${string}`; }   // booking id
  | { kind: 'freed';
      title: 'Vasketid ledig';
      body: string;            // "Tirsdag 14:00–15:00 er ledig nu"
      url: string;             // `/?date=YYYY-MM-DD&hour=14` — deep-links and focuses slot
      tag: `freed:${string}:${number}`; }
```

The freed-slot deep link **highlights and scrolls to** the slot but does **not** reserve it — first to tap and book wins.

### iOS specifics
- `isIOS && !standalone` → push toggles disabled with install nudge.
- iOS 16.4+ requirement is documented in the install instructions sheet.
- iOS PWA can briefly lose its `pushManager` subscription after iOS updates — the client re-checks on each launch and re-subscribes silently if permission still granted.

---

## 6. Cron jobs

`vercel.json`:
```json
{
  "crons": [
    { "path": "/api/cron/reminders", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/cleanup",   "schedule": "0 3 * * *" }
  ]
}
```

Both routes guard:
```ts
if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`)
  return new Response('Unauthorized', { status: 401 })
```

### `/api/cron/reminders` (every 5 min)
1. `SELECT booking_id FROM reminder_jobs WHERE sent_at IS NULL AND fire_at <= now() + interval '5 min'`
2. For each: load booking, then push subs for that apartment where `reminder_enabled = true`.
3. Send reminder payload to each sub. On 404/410 → delete sub.
4. `UPDATE reminder_jobs SET sent_at = now() WHERE booking_id = ?`.

The 5-minute window with `<= now() + 5min` guarantees a 13:30 reminder is caught by either the 13:25 or 13:30 cron run; `sent_at` prevents duplicates.

### `/api/cron/cleanup` (daily 03:00 UTC — exact local time doesn't matter for cleanup)
- `DELETE FROM slot_watches WHERE (date, hour) is in the past`
- `DELETE FROM reminder_jobs WHERE sent_at IS NOT NULL AND sent_at < now() - interval '7 days'`
- `DELETE FROM bookings WHERE date < now() - interval '90 days'` (history retention)

Stale subscription cleanup happens inline in the reminders cron via 404/410 detection — no separate sweep needed.

---

## 7. Validation rules summary

| Rule | Where enforced | Error code |
|------|----------------|------------|
| Slot uniqueness `(date, hour)` | DB unique index | `SLOT_TAKEN` |
| Max 3 hours per apartment per calendar day | server tx, server action | `MAX_3H_PER_DAY` |
| Cannot book in the past | server action | `PAST_SLOT` |
| Max 14 days ahead | server action | `HORIZON_EXCEEDED` |
| Hour in `[7, 21]` | server action | `OUT_OF_HOURS` |
| Cancel only own apartment's booking | server action via cookie | `NOT_FOUND_OR_NOT_YOURS` |
| Cannot watch own apartment's booking | server action | `OWN_APARTMENT` |
| Wrong passcode | server action | `INVALID_PASSCODE` |

UI mirrors these as disabled buttons, tooltips, and toasts so users rarely see raw errors.

---

## 8. Security headers (`next.config.ts`)

Per the Next.js PWA guide:
- Global: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`
- `/sw.js`: `Cache-Control: no-cache, no-store, must-revalidate`, `Content-Type: application/javascript; charset=utf-8`, strict CSP

---

## 9. Local development

- `next dev --experimental-https` so service worker + push work locally.
- `.env.local` for `DATABASE_URL`, `BUILDING_PASSCODE`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET`, `COOKIE_SECRET`.
- Drizzle Kit: `drizzle-kit push` for dev, `drizzle-kit migrate` for prod.
- Neon free tier; one branch for prod, one for preview/PR.
- Cron jobs in dev: a tiny `pnpm cron:reminders` script that hits the local route with the secret, run manually when testing.

---

## 10. Out of scope (explicitly v2 or later)

- Offline support (reads or writes). Online-only PWA in v1.
- Admin panel, payments, user accounts beyond apartment selection.
- Realtime updates (others' bookings appear after page refresh / manual reload).
- Email or SMS fallbacks for push.
- Multi-machine support (single shared washer assumed).

---

## 11. Decisions log

- **Master "freed slot" toggle** governs all per-slot subscriptions. OFF suppresses pushes but keeps watches.
- **Apartment owns bookings** — cross-device cancellation works for the same apartment.
- **iOS push:** detect-and-nudge inline when not installed.
- **Backend:** Vercel + Neon + Drizzle (Supabase dropped — overkill for this trust model and feature set).
- **PWA library:** none (plain `public/sw.js`). Serwist evaluated, dropped because offline is descoped.
- **Offline:** descoped to v2.
