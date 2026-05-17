# Vaskebooking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a tiny PWA where 10 apartments in a Danish andelsforening book 1-hour laundry slots, with push notifications and per-slot watch-when-free.

**Architecture:** Next.js 16 App Router on Vercel · Neon Postgres + Drizzle · plain `public/sw.js` · `web-push` + VAPID · Vercel Cron · shadcn/ui base + shadcnstudio.com smart blocks. Auth = apartment cookie + shared building passcode. All slot rules enforced server-side in transactions.

**Tech Stack:** Next.js 16, TypeScript, Tailwind v4, shadcn/ui, Drizzle ORM, Neon (HTTP for reads / serverless WS for tx writes), web-push, sonner, vitest.

**Reference spec:** `docs/superpowers/specs/2026-05-17-vaskebooking-design.md`

---

## Notes for the implementer

- Cwd is `/Users/frederiksally/Dropbox/FS/Repos/vaskebooking`. The git repo is initialized; the spec is committed at `docs/superpowers/specs/...`.
- All shell commands use `pnpm`. Node 20.x is installed.
- All UI copy is **Danish** (`da-DK`). Day/month names use `Intl.DateTimeFormat('da-DK', ...)`.
- Time zone is `Europe/Copenhagen`. Use `date-fns-tz` for tz-aware conversions; install it explicitly.
- Test runner is **vitest**. We test `lib/*` (validation, time helpers) and the server actions. UI tests are skipped — too brittle for the timeline.
- Commit after every passing test step. Use Conventional Commits prefixes (`feat:`, `chore:`, `test:`, `docs:`).
- `web-push` requires Node.js runtime, NOT edge. Cron + push routes must declare `export const runtime = 'nodejs'`.
- Neon caveat: `drizzle-orm/neon-http` is single-roundtrip but **does not support transactions**. We need transactions for `createBooking` / `cancelBooking`. Use `drizzle-orm/neon-serverless` (WebSocket Pool) for the write path. Reads can use either; we'll use serverless throughout for simplicity.
- **Vercel Hobby** historically caps cron to daily. If a `*/5` schedule is rejected at deploy, swap `vercel.json` for a GitHub Actions workflow that hits the route every 5 min with `CRON_SECRET`. Plan includes this fallback in Task 17.
- We do not have an existing test suite to reference. Tests are written from scratch using vitest.

---

## File structure

| File | Responsibility |
|------|----------------|
| `app/manifest.ts` | Next.js typed PWA manifest |
| `app/layout.tsx` | HTML shell, fonts, theme color, sonner Toaster, sw register |
| `app/page.tsx` | Home calendar + slots (server component, hydrates client islands) |
| `app/page-client.tsx` | Client-side calendar interactions |
| `app/onboarding/page.tsx` | Apartment + passcode form |
| `app/bookings/page.tsx` | Mine, Vagter, Historik |
| `app/settings/page.tsx` | Apartment, push toggles, install button |
| `app/actions/auth.ts` | `login`, `changeApartment`, `logout` server actions |
| `app/actions/bookings.ts` | `createBooking`, `cancelBooking`, `listBookings` |
| `app/actions/push.ts` | `subscribeUser`, `unsubscribeUser`, `setNotifPrefs`, `watchSlot`, `unwatchSlot` |
| `app/api/cron/reminders/route.ts` | 5-min cron — fire reminders |
| `app/api/cron/cleanup/route.ts` | Daily cron — prune stale rows |
| `public/sw.js` | Service worker (push + notificationclick) |
| `public/icons/*` | PWA icons (192, 512, maskable-512, badge) |
| `db/schema.ts` | Drizzle table defs |
| `db/index.ts` | Drizzle client (Neon serverless) |
| `lib/apartments.ts` | The 10 apartments + per-apartment colors |
| `lib/auth.ts` | Cookie helpers (read/set/clear apartment + signed device_id) |
| `lib/push.ts` | `web-push` wrapper, payload types, send+prune-on-410 |
| `lib/validation.ts` | Pure rule checks (3h/day, horizon, hours, past) |
| `lib/time.ts` | Europe/Copenhagen helpers (slot-start UTC, isPast, fmtSlot) |
| `lib/errors.ts` | `RuleError` class + Danish error messages |
| `next.config.ts` | Security headers (sw.js + global) |
| `vercel.json` | Cron schedules |
| `drizzle.config.ts` | Drizzle Kit config |
| `vitest.config.ts` | Vitest config |
| `.env.example` | Documented env vars |

---

## Task 1: Scaffold Next.js 16 app

**Files:**
- Create: every initial Next.js file via the scaffolder

- [ ] **Step 1: Run scaffolder in current directory**

We're already in an empty `vaskebooking/` (only `.git/` and `docs/`). Use `.` as the project name to scaffold in place.

```bash
pnpm create next-app@latest . --ts --tailwind --eslint --app --src-dir=false --import-alias="@/*" --use-pnpm
```

If prompted about non-empty directory, choose to continue (we only have `.git` + `docs/`, not source files).

- [ ] **Step 2: Verify it built**

```bash
pnpm install
pnpm build
```
Expected: a successful build, `.next/` directory created, no TS errors.

- [ ] **Step 3: Add .gitignore entries we'll want**

Append to `.gitignore`:
```
.env.local
.env.*.local
.vercel
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold next.js 16 app with typescript and tailwind"
```

---

## Task 2: Set up testing (vitest)

**Files:**
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Modify: `package.json` (add test script)

- [ ] **Step 1: Install deps**

```bash
pnpm add -D vitest @vitejs/plugin-react vite-tsconfig-paths jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 2: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
})
```

- [ ] **Step 3: Write `vitest.setup.ts`**

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 4: Add scripts to `package.json`**

In `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Sanity test — write `lib/__tests__/sanity.test.ts`**

```ts
import { describe, it, expect } from 'vitest'

describe('sanity', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 6: Run tests**

```bash
pnpm test
```
Expected: 1 passed.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: add vitest with jsdom and tsconfig-paths"
```

---

## Task 3: Define apartments + colors

**Files:**
- Create: `lib/apartments.ts`
- Create: `lib/__tests__/apartments.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/__tests__/apartments.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { APARTMENTS, isApartment, apartmentColor } from '@/lib/apartments'

describe('apartments', () => {
  it('has all 10 apartments in expected order', () => {
    expect(APARTMENTS).toEqual([
      'St. tv', 'St. th',
      '1. tv', '1. th',
      '2. tv', '2. th',
      '3. tv', '3. th',
      '4. tv', '4. th',
    ])
  })

  it('isApartment narrows correctly', () => {
    expect(isApartment('1. tv')).toBe(true)
    expect(isApartment('5. tv')).toBe(false)
    expect(isApartment('')).toBe(false)
  })

  it('every apartment has a unique color', () => {
    const colors = APARTMENTS.map(apartmentColor)
    expect(new Set(colors).size).toBe(APARTMENTS.length)
  })
})
```

- [ ] **Step 2: Run, expect fail (module missing)**

```bash
pnpm test apartments
```
Expected: FAIL "Cannot find module '@/lib/apartments'".

- [ ] **Step 3: Implement `lib/apartments.ts`**

```ts
export const APARTMENTS = [
  'St. tv', 'St. th',
  '1. tv', '1. th',
  '2. tv', '2. th',
  '3. tv', '3. th',
  '4. tv', '4. th',
] as const

export type Apartment = (typeof APARTMENTS)[number]

export function isApartment(value: unknown): value is Apartment {
  return typeof value === 'string' && (APARTMENTS as readonly string[]).includes(value)
}

const COLOR_MAP: Record<Apartment, string> = {
  'St. tv': '#ef4444', 'St. th': '#f97316',
  '1. tv':  '#eab308', '1. th':  '#84cc16',
  '2. tv':  '#10b981', '2. th':  '#06b6d4',
  '3. tv':  '#3b82f6', '3. th':  '#8b5cf6',
  '4. tv':  '#ec4899', '4. th':  '#a855f7',
}

export function apartmentColor(apartment: Apartment): string {
  return COLOR_MAP[apartment]
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm test apartments
```
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: define 10 apartments with deterministic colors"
```

---

## Task 4: Time helpers (Europe/Copenhagen)

**Files:**
- Create: `lib/time.ts`
- Create: `lib/__tests__/time.test.ts`

- [ ] **Step 1: Install date-fns + tz**

```bash
pnpm add date-fns date-fns-tz
```

- [ ] **Step 2: Write the failing test**

`lib/__tests__/time.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { slotStartUtc, reminderFireUtc, isPastSlot, fmtSlotDanish, fmtDayDanish, todayInCph, daysFromTodayCph } from '@/lib/time'

describe('time', () => {
  it('slotStartUtc converts CPH local hour to UTC instant', () => {
    // 2026-01-15 14:00 CPH = 13:00 UTC (winter, +01:00)
    expect(slotStartUtc('2026-01-15', 14).toISOString()).toBe('2026-01-15T13:00:00.000Z')
    // 2026-07-15 14:00 CPH = 12:00 UTC (summer, +02:00)
    expect(slotStartUtc('2026-07-15', 14).toISOString()).toBe('2026-07-15T12:00:00.000Z')
  })

  it('reminderFireUtc is slot start minus 30 minutes', () => {
    expect(reminderFireUtc('2026-01-15', 14).toISOString()).toBe('2026-01-15T12:30:00.000Z')
  })

  it('isPastSlot is true if slot start is before now', () => {
    const past = new Date('2020-01-01T00:00:00Z')
    const future = new Date('2999-01-01T00:00:00Z')
    expect(isPastSlot('2026-01-15', 14, past)).toBe(false)
    expect(isPastSlot('2026-01-15', 14, future)).toBe(true)
  })

  it('fmtSlotDanish formats correctly', () => {
    expect(fmtSlotDanish('2026-05-19', 14)).toBe('tirsdag 19. maj kl. 14:00–15:00')
  })

  it('fmtDayDanish formats correctly', () => {
    expect(fmtDayDanish('2026-05-19')).toBe('tirsdag 19. maj')
  })

  it('todayInCph returns ISO date string in CPH zone', () => {
    const d = todayInCph(new Date('2026-05-17T22:30:00Z'))
    expect(d).toBe('2026-05-18') // 00:30 CPH next day in summer
  })

  it('daysFromTodayCph counts whole days difference', () => {
    expect(daysFromTodayCph('2026-05-17', new Date('2026-05-17T10:00:00+02:00'))).toBe(0)
    expect(daysFromTodayCph('2026-05-31', new Date('2026-05-17T10:00:00+02:00'))).toBe(14)
  })
})
```

- [ ] **Step 3: Run, expect fail**

```bash
pnpm test time
```

- [ ] **Step 4: Implement `lib/time.ts`**

```ts
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz'

export const TZ = 'Europe/Copenhagen'

export function slotStartUtc(date: string, hour: number): Date {
  // date is YYYY-MM-DD interpreted in CPH at HH:00
  return fromZonedTime(`${date} ${String(hour).padStart(2, '0')}:00:00`, TZ)
}

export function reminderFireUtc(date: string, hour: number): Date {
  return new Date(slotStartUtc(date, hour).getTime() - 30 * 60 * 1000)
}

export function isPastSlot(date: string, hour: number, now: Date = new Date()): boolean {
  return slotStartUtc(date, hour).getTime() < now.getTime()
}

export function fmtSlotDanish(date: string, hour: number): string {
  const day = fmtDayDanish(date)
  const next = String(hour + 1).padStart(2, '0')
  const start = String(hour).padStart(2, '0')
  return `${day} kl. ${start}:00–${next}:00`
}

export function fmtDayDanish(date: string): string {
  const start = slotStartUtc(date, 0)
  return formatInTimeZone(start, TZ, "EEEE d. MMMM", { locale: undefined as any })
    .replace(/^./, (c) => c.toLowerCase())
    // date-fns Danish locale not loaded by default; format with English then map.
    // Replaced below with full Danish via a manual locale import.
}

export function todayInCph(now: Date = new Date()): string {
  return formatInTimeZone(now, TZ, 'yyyy-MM-dd')
}

export function daysFromTodayCph(date: string, now: Date = new Date()): number {
  const today = todayInCph(now)
  const a = Date.UTC(...(today.split('-').map(Number) as [number, number, number]))
  const b = Date.UTC(...(date.split('-').map(Number) as [number, number, number]))
  return Math.round((b - a) / 86_400_000)
}
```

> The `fmtDayDanish` above is wrong — date-fns needs an explicit Danish locale. Fix in the next step.

- [ ] **Step 5: Add Danish locale to formatter**

Replace the body of `fmtDayDanish` with:
```ts
import { da } from 'date-fns/locale'
// at top of file

export function fmtDayDanish(date: string): string {
  const start = slotStartUtc(date, 0)
  return formatInTimeZone(start, TZ, 'EEEE d. MMMM', { locale: da })
}
```
And remove the broken `.replace(...)` chain.

- [ ] **Step 6: Run, expect pass**

```bash
pnpm test time
```
Expected: all 7 tests pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: tz-aware time helpers for Europe/Copenhagen"
```

---

## Task 5: Validation rules (pure functions)

**Files:**
- Create: `lib/errors.ts`
- Create: `lib/validation.ts`
- Create: `lib/__tests__/validation.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/__tests__/validation.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { assertBookable } from '@/lib/validation'
import { RuleError } from '@/lib/errors'

const NOW = new Date('2026-05-17T08:00:00+02:00') // Sunday

describe('validation', () => {
  it('passes for a valid future slot', () => {
    expect(() => assertBookable({
      date: '2026-05-18', hour: 14, sameDayCount: 0, now: NOW,
    })).not.toThrow()
  })

  it('rejects out-of-hours', () => {
    expect(() => assertBookable({ date: '2026-05-18', hour: 6, sameDayCount: 0, now: NOW }))
      .toThrow(RuleError)
    expect(() => assertBookable({ date: '2026-05-18', hour: 22, sameDayCount: 0, now: NOW }))
      .toThrow(RuleError)
  })

  it('rejects past slots', () => {
    expect(() => assertBookable({ date: '2026-05-17', hour: 7, sameDayCount: 0, now: NOW }))
      .toThrow(/PAST_SLOT/)
  })

  it('accepts today if hour is in the future', () => {
    expect(() => assertBookable({ date: '2026-05-17', hour: 14, sameDayCount: 0, now: NOW }))
      .not.toThrow()
  })

  it('rejects > 14 days ahead', () => {
    expect(() => assertBookable({ date: '2026-06-01', hour: 14, sameDayCount: 0, now: NOW }))
      .toThrow(/HORIZON_EXCEEDED/)
  })

  it('rejects when sameDayCount >= 3', () => {
    expect(() => assertBookable({ date: '2026-05-18', hour: 14, sameDayCount: 3, now: NOW }))
      .toThrow(/MAX_3H_PER_DAY/)
  })
})
```

- [ ] **Step 2: Run, expect fail**

```bash
pnpm test validation
```

- [ ] **Step 3: Implement `lib/errors.ts`**

```ts
export type RuleCode =
  | 'SLOT_TAKEN'
  | 'MAX_3H_PER_DAY'
  | 'PAST_SLOT'
  | 'HORIZON_EXCEEDED'
  | 'OUT_OF_HOURS'
  | 'NOT_FOUND_OR_NOT_YOURS'
  | 'OWN_APARTMENT'
  | 'INVALID_PASSCODE'
  | 'INVALID_APARTMENT'

export class RuleError extends Error {
  constructor(public code: RuleCode, message?: string) {
    super(message ?? code)
    this.name = 'RuleError'
  }
}

export const DANISH_MESSAGES: Record<RuleCode, string> = {
  SLOT_TAKEN: 'Tiden er lige blevet booket. Prøv en anden.',
  MAX_3H_PER_DAY: 'Du har allerede booket 3 timer i dag. Annullér en eksisterende booking først.',
  PAST_SLOT: 'Du kan ikke booke i fortiden.',
  HORIZON_EXCEEDED: 'Du kan kun booke op til 14 dage frem.',
  OUT_OF_HOURS: 'Vasketider er kun mellem 07:00 og 22:00.',
  NOT_FOUND_OR_NOT_YOURS: 'Bookingen findes ikke eller tilhører ikke din lejlighed.',
  OWN_APARTMENT: 'Du kan ikke vagte din egen booking.',
  INVALID_PASSCODE: 'Forkert kode.',
  INVALID_APARTMENT: 'Ugyldig lejlighed.',
}
```

- [ ] **Step 4: Implement `lib/validation.ts`**

```ts
import { RuleError } from '@/lib/errors'
import { isPastSlot, daysFromTodayCph } from '@/lib/time'

export const FIRST_HOUR = 7
export const LAST_HOUR = 21          // last *start* hour; 21:00–22:00 is the last slot
export const MAX_HOURS_PER_DAY = 3
export const MAX_HORIZON_DAYS = 14

export interface BookableInput {
  date: string
  hour: number
  sameDayCount: number
  now?: Date
}

export function assertBookable({ date, hour, sameDayCount, now = new Date() }: BookableInput): void {
  if (hour < FIRST_HOUR || hour > LAST_HOUR) throw new RuleError('OUT_OF_HOURS')
  if (isPastSlot(date, hour, now)) throw new RuleError('PAST_SLOT')
  if (daysFromTodayCph(date, now) > MAX_HORIZON_DAYS) throw new RuleError('HORIZON_EXCEEDED')
  if (sameDayCount >= MAX_HOURS_PER_DAY) throw new RuleError('MAX_3H_PER_DAY')
}
```

- [ ] **Step 5: Run, expect pass**

```bash
pnpm test validation
```
Expected: 6 passed.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: pure validation rules with danish error messages"
```

---

## Task 6: Database — Drizzle schema + Neon client

**Files:**
- Create: `db/schema.ts`
- Create: `db/index.ts`
- Create: `drizzle.config.ts`
- Create: `.env.example`
- Modify: `package.json` (add db:push, db:generate scripts)

- [ ] **Step 1: Install deps**

```bash
pnpm add drizzle-orm @neondatabase/serverless ws
pnpm add -D drizzle-kit dotenv
```

(`ws` is required by `neon-serverless` for Node-side WebSocket; on Vercel it's pre-bundled but locally we need it.)

- [ ] **Step 2: Write `db/schema.ts`**

```ts
import { pgTable, uuid, text, date, smallint, timestamp, boolean, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const bookings = pgTable('bookings', {
  id: uuid().defaultRandom().primaryKey(),
  apartment: text().notNull(),
  date: date().notNull(),
  hour: smallint().notNull(),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  slotUnique: uniqueIndex('booking_slot_unique').on(t.date, t.hour),
  apartmentDateIdx: index('booking_apartment_date_idx').on(t.apartment, t.date),
}))

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid().defaultRandom().primaryKey(),
  apartment: text().notNull(),
  deviceId: text('device_id').notNull(),
  endpoint: text().notNull().unique(),
  p256dh: text().notNull(),
  auth: text().notNull(),
  reminderEnabled: boolean('reminder_enabled').default(true).notNull(),
  freedSlotEnabled: boolean('freed_slot_enabled').default(true).notNull(),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
})

export const slotWatches = pgTable('slot_watches', {
  id: uuid().defaultRandom().primaryKey(),
  apartment: text().notNull(),
  deviceId: text('device_id').notNull(),
  date: date().notNull(),
  hour: smallint().notNull(),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  watchUnique: uniqueIndex('watch_unique').on(t.deviceId, t.date, t.hour),
  slotIdx: index('watch_slot_idx').on(t.date, t.hour),
}))

export const reminderJobs = pgTable('reminder_jobs', {
  bookingId: uuid('booking_id').primaryKey().references(() => bookings.id, { onDelete: 'cascade' }),
  fireAt: timestamp('fire_at', { withTimezone: true }).notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
}, (t) => ({
  pendingIdx: index('reminder_pending_idx').on(t.fireAt).where(sql`sent_at is null`),
}))
```

- [ ] **Step 3: Write `db/index.ts`**

```ts
import { Pool, neonConfig } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import ws from 'ws'
import * as schema from '@/db/schema'

if (typeof WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
export const db = drizzle(pool, { schema })
export { schema }
```

- [ ] **Step 4: Write `drizzle.config.ts`**

```ts
import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
})
```

- [ ] **Step 5: Write `.env.example`**

```
DATABASE_URL=postgres://user:pass@host/db?sslmode=require
BUILDING_PASSCODE=4242
COOKIE_SECRET=replace-with-32-byte-random-hex
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_CONTACT=mailto:admin@example.com
CRON_SECRET=replace-with-random
```

- [ ] **Step 6: Add scripts to `package.json`**

```json
"db:push": "drizzle-kit push",
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate"
```

- [ ] **Step 7: Verify it typechecks**

```bash
pnpm exec tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: drizzle schema + neon client for bookings, push subs, watches, reminders"
```

---

## Task 7: Cookie-based auth (`lib/auth.ts`)

**Files:**
- Create: `lib/auth.ts`
- Create: `lib/__tests__/auth.test.ts`

- [ ] **Step 1: Install jose for signed cookies**

```bash
pnpm add jose
```

- [ ] **Step 2: Write the failing test**

`lib/__tests__/auth.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { signDeviceId, verifyDeviceId } from '@/lib/auth'

describe('auth signed cookie', () => {
  it('round-trips a device id', async () => {
    const secret = '0'.repeat(64)
    const signed = await signDeviceId('abc-123', secret)
    expect(await verifyDeviceId(signed, secret)).toBe('abc-123')
  })

  it('returns null for tampered token', async () => {
    const secret = '0'.repeat(64)
    const signed = await signDeviceId('abc-123', secret)
    expect(await verifyDeviceId(signed + 'x', secret)).toBe(null)
  })

  it('returns null for wrong secret', async () => {
    const signed = await signDeviceId('abc-123', '0'.repeat(64))
    expect(await verifyDeviceId(signed, '1'.repeat(64))).toBe(null)
  })
})
```

- [ ] **Step 3: Run, expect fail**

```bash
pnpm test auth
```

- [ ] **Step 4: Implement `lib/auth.ts`** (sign/verify halves first)

```ts
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { isApartment, type Apartment } from '@/lib/apartments'

const ALG = 'HS256'

function secretKey(raw: string): Uint8Array {
  return new TextEncoder().encode(raw)
}

export async function signDeviceId(deviceId: string, secret: string): Promise<string> {
  return await new SignJWT({ deviceId })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .sign(secretKey(secret))
}

export async function verifyDeviceId(token: string, secret: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(secret), { algorithms: [ALG] })
    return typeof payload.deviceId === 'string' ? payload.deviceId : null
  } catch {
    return null
  }
}

export interface Session {
  apartment: Apartment
  deviceId: string
}

export async function getSession(): Promise<Session | null> {
  const c = await cookies()
  const apartment = c.get('apartment')?.value
  const token = c.get('device_id')?.value
  if (!apartment || !token) return null
  if (!isApartment(apartment)) return null
  const deviceId = await verifyDeviceId(token, process.env.COOKIE_SECRET!)
  if (!deviceId) return null
  return { apartment, deviceId }
}

export async function setSession(apartment: Apartment, deviceId: string): Promise<void> {
  const c = await cookies()
  const token = await signDeviceId(deviceId, process.env.COOKIE_SECRET!)
  const oneYear = 60 * 60 * 24 * 365
  c.set('apartment', apartment, { httpOnly: false, sameSite: 'lax', secure: true, maxAge: oneYear, path: '/' })
  c.set('device_id', token, { httpOnly: true, sameSite: 'lax', secure: true, maxAge: oneYear, path: '/' })
}

export async function clearSession(): Promise<void> {
  const c = await cookies()
  c.delete('apartment')
  c.delete('device_id')
}

export function newDeviceId(): string {
  return crypto.randomUUID()
}
```

- [ ] **Step 5: Run, expect pass**

```bash
pnpm test auth
```
Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: cookie-based auth with signed device id"
```

---

## Task 8: Login server action + onboarding page

**Files:**
- Create: `app/actions/auth.ts`
- Create: `app/onboarding/page.tsx`
- Create: `app/onboarding/onboarding-form.tsx`

- [ ] **Step 1: Write `app/actions/auth.ts`**

```ts
'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { APARTMENTS, type Apartment } from '@/lib/apartments'
import { setSession, clearSession, newDeviceId, getSession } from '@/lib/auth'
import { RuleError } from '@/lib/errors'

const LoginSchema = z.object({
  apartment: z.enum(APARTMENTS),
  passcode: z.string().min(1),
})

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; code: string }

export async function login(form: FormData): Promise<ActionResult> {
  const parsed = LoginSchema.safeParse({
    apartment: form.get('apartment'),
    passcode: form.get('passcode'),
  })
  if (!parsed.success) return { ok: false, code: 'INVALID_APARTMENT' }
  if (parsed.data.passcode !== process.env.BUILDING_PASSCODE) {
    return { ok: false, code: 'INVALID_PASSCODE' }
  }
  const existing = await getSession()
  const deviceId = existing?.deviceId ?? newDeviceId()
  await setSession(parsed.data.apartment, deviceId)
  redirect('/')
}

export async function changeApartment(form: FormData): Promise<ActionResult> {
  // identical to login — re-validate passcode + new apartment
  return await login(form)
}

export async function logout(): Promise<void> {
  await clearSession()
  redirect('/onboarding')
}
```

- [ ] **Step 2: Install zod**

```bash
pnpm add zod
```

- [ ] **Step 3: Add shadcn deps used by onboarding**

```bash
pnpm dlx shadcn@latest init
```
When prompted: base color *zinc*, CSS variables *yes*, accept defaults. Then:
```bash
pnpm dlx shadcn@latest add button input label sonner
```

- [ ] **Step 4: Write `app/onboarding/onboarding-form.tsx`** (client component)

```tsx
'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { APARTMENTS, type Apartment, apartmentColor } from '@/lib/apartments'
import { login } from '@/app/actions/auth'
import { DANISH_MESSAGES } from '@/lib/errors'

export function OnboardingForm() {
  const [apt, setApt] = useState<Apartment | null>(null)
  const [pending, start] = useTransition()

  async function onSubmit(form: FormData) {
    if (!apt) { toast.error('Vælg en lejlighed'); return }
    form.set('apartment', apt)
    start(async () => {
      const res = await login(form)
      // login() redirects on success, so we only land here on error
      if (res && !res.ok) toast.error(DANISH_MESSAGES[res.code as keyof typeof DANISH_MESSAGES] ?? 'Ukendt fejl')
    })
  }

  return (
    <form action={onSubmit} className="mx-auto max-w-md space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Velkommen til Vaskebooking</h1>
      <div>
        <Label className="mb-2 block">Vælg din lejlighed</Label>
        <div className="grid grid-cols-2 gap-2">
          {APARTMENTS.map((a) => (
            <button
              type="button"
              key={a}
              onClick={() => setApt(a)}
              className={`flex items-center gap-2 rounded-lg border p-3 text-left transition ${
                apt === a ? 'border-primary bg-primary/5' : 'hover:bg-accent'
              }`}
            >
              <span className="size-3 rounded-full" style={{ background: apartmentColor(a) }} />
              {a}
            </button>
          ))}
        </div>
      </div>
      <div>
        <Label htmlFor="passcode">Bygningens kode</Label>
        <Input id="passcode" name="passcode" type="password" inputMode="numeric" autoComplete="off" required />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>{pending ? 'Logger ind…' : 'Log ind'}</Button>
    </form>
  )
}
```

- [ ] **Step 5: Write `app/onboarding/page.tsx`**

```tsx
import { OnboardingForm } from './onboarding-form'

export default function OnboardingPage() {
  return <OnboardingForm />
}
```

- [ ] **Step 6: Add Toaster to root layout**

In `app/layout.tsx`, in the body before `{children}`, add:
```tsx
import { Toaster } from '@/components/ui/sonner'
```
And inside `<body>`:
```tsx
<Toaster richColors position="top-center" />
```

- [ ] **Step 7: Add a redirect if not authed (middleware or root page)**

Create `middleware.ts`:
```ts
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC = ['/onboarding', '/_next', '/icons', '/manifest.webmanifest', '/sw.js', '/api/cron']

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next()
  const apartment = req.cookies.get('apartment')?.value
  if (!apartment) return NextResponse.redirect(new URL('/onboarding', req.url))
  return NextResponse.next()
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] }
```

- [ ] **Step 8: Manual smoke test**

Set `BUILDING_PASSCODE=4242` and `COOKIE_SECRET=$(openssl rand -hex 32)` in `.env.local`. Set `DATABASE_URL` to a Neon dev URL.

```bash
pnpm dev
```
Visit `/`, expect redirect to `/onboarding`. Pick `1. tv`, enter `4242`, submit. Expect redirect to `/`. Wrong code → toast.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: onboarding with apartment picker + shared passcode auth"
```

---

## Task 9: Booking server actions

**Files:**
- Create: `app/actions/bookings.ts`
- Create: `app/actions/__tests__/bookings.test.ts` (pure-function tests for the validation layer; integration covered manually)

> Note: We don't run integration tests against Neon. The validation layer is unit tested in Task 5; here we test the action's transaction logic by mocking `db`. Keep tests minimal — focus on rule mapping, not Drizzle internals.

- [ ] **Step 1: Write the failing test**

`app/actions/__tests__/bookings.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({
  getSession: vi.fn(async () => ({ apartment: '1. tv', deviceId: 'd1' })),
}))

const mockTx = {
  select: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
}
vi.mock('@/db', () => ({
  db: { transaction: vi.fn(async (fn) => fn(mockTx)) },
  schema: {},
}))

import { createBooking } from '@/app/actions/bookings'

describe('createBooking', () => {
  beforeEach(() => {
    mockTx.select.mockReset()
    mockTx.insert.mockReset()
    mockTx.delete.mockReset()
  })

  it('rejects when apartment already has 3 bookings on that date', async () => {
    mockTx.select.mockReturnValue({
      from: () => ({ where: () => Promise.resolve([{ id: 'a' }, { id: 'b' }, { id: 'c' }]) }),
    })
    const res = await createBooking({ date: '2099-05-18', hour: 14 })
    expect(res).toEqual({ ok: false, code: 'MAX_3H_PER_DAY' })
  })

  it('returns SLOT_TAKEN on unique violation', async () => {
    mockTx.select.mockReturnValue({
      from: () => ({ where: () => Promise.resolve([]) }),
    })
    mockTx.insert.mockReturnValue({
      values: () => ({ returning: () => Promise.reject(Object.assign(new Error('unique'), { code: '23505' })) }),
    })
    const res = await createBooking({ date: '2099-05-18', hour: 14 })
    expect(res).toEqual({ ok: false, code: 'SLOT_TAKEN' })
  })
})
```

- [ ] **Step 2: Run, expect fail**

```bash
pnpm test bookings
```

- [ ] **Step 3: Implement `app/actions/bookings.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { and, eq, gte, ne } from 'drizzle-orm'
import { db, schema } from '@/db'
import { getSession } from '@/lib/auth'
import { assertBookable } from '@/lib/validation'
import { reminderFireUtc, todayInCph } from '@/lib/time'
import { RuleError, type RuleCode } from '@/lib/errors'
import { sendFreedSlotPush } from '@/lib/push'

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; code: RuleCode }

const CreateSchema = z.object({ date: z.string(), hour: z.number().int() })
const CancelSchema = z.object({ id: z.string().uuid() })

function pgErrorCode(e: unknown): string | undefined {
  return typeof e === 'object' && e && 'code' in e ? (e as { code?: string }).code : undefined
}

export async function createBooking(input: { date: string; hour: number }): Promise<ActionResult<{ id: string }>> {
  const parsed = CreateSchema.safeParse(input)
  if (!parsed.success) return { ok: false, code: 'OUT_OF_HOURS' }
  const session = await getSession()
  if (!session) return { ok: false, code: 'NOT_FOUND_OR_NOT_YOURS' }

  try {
    const id = await db.transaction(async (tx) => {
      const sameDay = await tx
        .select({ id: schema.bookings.id })
        .from(schema.bookings)
        .where(and(eq(schema.bookings.apartment, session.apartment), eq(schema.bookings.date, parsed.data.date)))

      assertBookable({ date: parsed.data.date, hour: parsed.data.hour, sameDayCount: sameDay.length })

      const [row] = await tx.insert(schema.bookings).values({
        apartment: session.apartment,
        date: parsed.data.date,
        hour: parsed.data.hour,
      }).returning({ id: schema.bookings.id })

      await tx.insert(schema.reminderJobs).values({
        bookingId: row.id,
        fireAt: reminderFireUtc(parsed.data.date, parsed.data.hour),
      })
      return row.id
    })
    revalidatePath('/')
    revalidatePath('/bookings')
    return { ok: true, data: { id } }
  } catch (e) {
    if (e instanceof RuleError) return { ok: false, code: e.code }
    if (pgErrorCode(e) === '23505') return { ok: false, code: 'SLOT_TAKEN' }
    throw e
  }
}

export async function cancelBooking(input: { id: string }): Promise<ActionResult> {
  const parsed = CancelSchema.safeParse(input)
  if (!parsed.success) return { ok: false, code: 'NOT_FOUND_OR_NOT_YOURS' }
  const session = await getSession()
  if (!session) return { ok: false, code: 'NOT_FOUND_OR_NOT_YOURS' }

  const watchers = await db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(schema.bookings)
      .where(and(eq(schema.bookings.id, parsed.data.id), eq(schema.bookings.apartment, session.apartment)))
      .returning()
    if (!deleted) throw new RuleError('NOT_FOUND_OR_NOT_YOURS')

    const watchers = await tx
      .select()
      .from(schema.slotWatches)
      .where(and(
        eq(schema.slotWatches.date, deleted.date),
        eq(schema.slotWatches.hour, deleted.hour),
        ne(schema.slotWatches.apartment, deleted.apartment),
      ))

    await tx.delete(schema.slotWatches).where(and(
      eq(schema.slotWatches.date, deleted.date),
      eq(schema.slotWatches.hour, deleted.hour),
    ))

    return { date: deleted.date, hour: deleted.hour, watchers }
  }).catch((e) => {
    if (e instanceof RuleError) return { error: e.code as RuleCode }
    throw e
  })

  if ('error' in watchers) return { ok: false, code: watchers.error }

  // Fire pushes outside the transaction; failures are non-fatal.
  await Promise.allSettled(
    watchers.watchers.map((w) => sendFreedSlotPush(w.endpoint as string | undefined, watchers.date, watchers.hour))
  )
  // The select above doesn't hand us endpoint — fix in next step by joining push subs.
  revalidatePath('/')
  revalidatePath('/bookings')
  return { ok: true }
}

export async function listMyBookings() {
  const session = await getSession()
  if (!session) return []
  const today = todayInCph()
  return db
    .select()
    .from(schema.bookings)
    .where(and(eq(schema.bookings.apartment, session.apartment), gte(schema.bookings.date, today)))
}
```

> The cancel flow above has a bug: `slotWatches` doesn't have `endpoint`. Fix in next step.

- [ ] **Step 4: Fix cancel watcher push**

Replace the watcher select + push block in `cancelBooking` with a join against `pushSubscriptions`:

```ts
const watchers = await tx
  .select({
    endpoint: schema.pushSubscriptions.endpoint,
    p256dh: schema.pushSubscriptions.p256dh,
    auth: schema.pushSubscriptions.auth,
  })
  .from(schema.slotWatches)
  .innerJoin(
    schema.pushSubscriptions,
    and(
      eq(schema.slotWatches.deviceId, schema.pushSubscriptions.deviceId),
      eq(schema.pushSubscriptions.freedSlotEnabled, true),
    ),
  )
  .where(and(
    eq(schema.slotWatches.date, deleted.date),
    eq(schema.slotWatches.hour, deleted.hour),
    ne(schema.slotWatches.apartment, deleted.apartment),
  ))
```

And then:
```ts
await Promise.allSettled(
  watchers.watchers.map((w) => sendFreedSlotPush(w, watchers.date, watchers.hour))
)
```

(The `sendFreedSlotPush` signature is defined in Task 11 to accept the full subscription object.)

- [ ] **Step 5: Run, expect pass**

```bash
pnpm test bookings
```
Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: createBooking and cancelBooking server actions with watcher fan-out"
```

---

## Task 10: Push wrapper (`lib/push.ts`)

**Files:**
- Create: `lib/push.ts`

- [ ] **Step 1: Install web-push**

```bash
pnpm add web-push
pnpm add -D @types/web-push
```

- [ ] **Step 2: Implement `lib/push.ts`**

```ts
import 'server-only'
import webpush, { type PushSubscription as WebPushSubscription } from 'web-push'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { fmtSlotDanish, fmtDayDanish } from '@/lib/time'

let configured = false
function ensureConfigured() {
  if (configured) return
  webpush.setVapidDetails(
    process.env.VAPID_CONTACT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )
  configured = true
}

export type PushPayload =
  | { kind: 'reminder'; bookingId: string; title: string; body: string; url: string; tag: string }
  | { kind: 'freed'; date: string; hour: number; title: string; body: string; url: string; tag: string }

export interface SubscriptionRow {
  endpoint: string
  p256dh: string
  auth: string
}

export async function sendPush(sub: SubscriptionRow, payload: PushPayload): Promise<void> {
  ensureConfigured()
  const target: WebPushSubscription = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }
  try {
    await webpush.sendNotification(target, JSON.stringify(payload))
  } catch (e: unknown) {
    const status = (e as { statusCode?: number }).statusCode
    if (status === 404 || status === 410) {
      await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.endpoint, sub.endpoint))
    } else {
      console.error('push error', e)
    }
  }
}

export async function sendReminderPush(sub: SubscriptionRow, bookingId: string, date: string, hour: number) {
  await sendPush(sub, {
    kind: 'reminder',
    bookingId,
    title: 'Vasketid om 30 min',
    body: `Din vasketid ${fmtSlotDanish(date, hour)} starter snart`,
    url: '/bookings',
    tag: `reminder:${bookingId}`,
  })
}

export async function sendFreedSlotPush(sub: SubscriptionRow, date: string, hour: number) {
  await sendPush(sub, {
    kind: 'freed',
    date,
    hour,
    title: 'Vasketid ledig',
    body: `${fmtDayDanish(date)} kl. ${String(hour).padStart(2, '0')}:00 er ledig nu`,
    url: `/?date=${date}&hour=${hour}`,
    tag: `freed:${date}:${hour}`,
  })
}
```

- [ ] **Step 3: Verify it typechecks**

```bash
pnpm exec tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: web-push wrapper with auto-prune of expired endpoints"
```

---

## Task 11: Push subscription server actions

**Files:**
- Create: `app/actions/push.ts`

- [ ] **Step 1: Implement `app/actions/push.ts`**

```ts
'use server'

import { z } from 'zod'
import { and, eq, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { getSession } from '@/lib/auth'
import { RuleError, type RuleCode } from '@/lib/errors'

export type ActionResult = { ok: true } | { ok: false; code: RuleCode | 'NO_SESSION' }

const SubSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
})

export async function subscribeUser(input: { endpoint: string; p256dh: string; auth: string }): Promise<ActionResult> {
  const parsed = SubSchema.safeParse(input)
  if (!parsed.success) return { ok: false, code: 'INVALID_APARTMENT' }
  const session = await getSession()
  if (!session) return { ok: false, code: 'NO_SESSION' }

  await db
    .insert(schema.pushSubscriptions)
    .values({
      apartment: session.apartment,
      deviceId: session.deviceId,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.p256dh,
      auth: parsed.data.auth,
    })
    .onConflictDoUpdate({
      target: schema.pushSubscriptions.endpoint,
      set: { apartment: session.apartment, deviceId: session.deviceId, p256dh: parsed.data.p256dh, auth: parsed.data.auth },
    })
  return { ok: true }
}

export async function unsubscribeUser(endpoint: string): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return { ok: false, code: 'NO_SESSION' }
  await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.endpoint, endpoint))
  return { ok: true }
}

export async function setNotifPrefs(input: { reminder?: boolean; freed?: boolean }): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return { ok: false, code: 'NO_SESSION' }
  const set: Record<string, unknown> = {}
  if (input.reminder !== undefined) set.reminderEnabled = input.reminder
  if (input.freed !== undefined) set.freedSlotEnabled = input.freed
  if (Object.keys(set).length === 0) return { ok: true }
  await db
    .update(schema.pushSubscriptions)
    .set(set)
    .where(eq(schema.pushSubscriptions.deviceId, session.deviceId))
  return { ok: true }
}

const WatchSchema = z.object({ date: z.string(), hour: z.number().int().min(7).max(21) })

export async function watchSlot(input: { date: string; hour: number }): Promise<ActionResult> {
  const parsed = WatchSchema.safeParse(input)
  if (!parsed.success) return { ok: false, code: 'OUT_OF_HOURS' }
  const session = await getSession()
  if (!session) return { ok: false, code: 'NO_SESSION' }

  // Reject watch on own apartment's booking.
  const [b] = await db
    .select({ apartment: schema.bookings.apartment })
    .from(schema.bookings)
    .where(and(eq(schema.bookings.date, parsed.data.date), eq(schema.bookings.hour, parsed.data.hour)))
    .limit(1)
  if (b && b.apartment === session.apartment) return { ok: false, code: 'OWN_APARTMENT' }

  await db
    .insert(schema.slotWatches)
    .values({
      apartment: session.apartment,
      deviceId: session.deviceId,
      date: parsed.data.date,
      hour: parsed.data.hour,
    })
    .onConflictDoNothing({ target: [schema.slotWatches.deviceId, schema.slotWatches.date, schema.slotWatches.hour] })
  return { ok: true }
}

export async function unwatchSlot(input: { date: string; hour: number }): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return { ok: false, code: 'NO_SESSION' }
  await db.delete(schema.slotWatches).where(and(
    eq(schema.slotWatches.deviceId, session.deviceId),
    eq(schema.slotWatches.date, input.date),
    eq(schema.slotWatches.hour, input.hour),
  ))
  return { ok: true }
}

export async function listMyWatches() {
  const session = await getSession()
  if (!session) return []
  return db
    .select()
    .from(schema.slotWatches)
    .where(eq(schema.slotWatches.deviceId, session.deviceId))
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm exec tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: push subscribe/unsubscribe + per-slot watch actions"
```

---

## Task 12: Service worker + manifest

**Files:**
- Create: `app/manifest.ts`
- Create: `public/sw.js`
- Create: `public/icons/icon-192.png` (placeholder), `icon-512.png`, `icon-maskable-512.png`, `badge.png`
- Modify: `next.config.ts`

- [ ] **Step 1: Write `app/manifest.ts`**

```ts
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Vaskebooking',
    short_name: 'Vask',
    description: 'Book vasketider i andelsforeningen',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
```

- [ ] **Step 2: Write `public/sw.js`**

```js
self.addEventListener('install', (e) => { self.skipWaiting() })
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()) })

self.addEventListener('push', (e) => {
  if (!e.data) return
  const { title, body, url, tag } = e.data.json()
  e.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge.png',
    data: { url },
    tag,
    vibrate: [100, 50, 100],
  }))
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = (e.notification.data && e.notification.data.url) || '/'
  e.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true })
    const same = all.find((c) => c.url.startsWith(self.location.origin))
    if (same) {
      await same.focus()
      try { await same.navigate(url) } catch {}
      return
    }
    await clients.openWindow(url)
  })())
})
```

- [ ] **Step 3: Add icons (placeholders)**

Generate placeholder PNGs with a one-liner:
```bash
mkdir -p public/icons
pnpm dlx @squoosh/cli --resize '{"width":192,"height":192}' --webp '{"quality":90}' /dev/null 2>/dev/null || true
# Or simpler: use ImageMagick
brew install imagemagick 2>/dev/null || true
magick -size 192x192 xc:'#0a0a0a' -fill '#f97316' -gravity center -pointsize 80 -annotate 0 'V' public/icons/icon-192.png
magick -size 512x512 xc:'#0a0a0a' -fill '#f97316' -gravity center -pointsize 220 -annotate 0 'V' public/icons/icon-512.png
magick -size 512x512 xc:'#f97316' -fill '#0a0a0a' -gravity center -pointsize 220 -annotate 0 'V' public/icons/icon-maskable-512.png
magick -size 96x96 xc:'#f97316' -fill '#0a0a0a' -gravity center -pointsize 60 -annotate 0 'V' public/icons/badge.png
```
Skip if `magick` unavailable; commit blank PNGs from `https://realfavicongenerator.net/` and replace later. The PWA still works, the icons are just ugly.

- [ ] **Step 4: Add security headers + sw cache control to `next.config.ts`**

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
    ]
  },
}

export default nextConfig
```

- [ ] **Step 5: Register the service worker in the layout**

Append to `app/layout.tsx` body, just before `</body>` and after the Toaster:
```tsx
<script
  dangerouslySetInnerHTML={{
    __html: `if ('serviceWorker' in navigator) { window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })) }`,
  }}
/>
```

- [ ] **Step 6: Set metadata in `app/layout.tsx`**

```tsx
import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Vaskebooking',
  description: 'Book vasketider i andelsforeningen',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Vask' },
}

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
}
```

- [ ] **Step 7: Build, smoke test in browser**

```bash
pnpm build && pnpm start
```
Open Chrome devtools → Application → Manifest. Expect Vaskebooking name + icons. Service worker registered.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: pwa manifest, service worker, icons, security headers"
```

---

## Task 13: Push subscription UI in Settings

**Files:**
- Create: `app/settings/page.tsx`
- Create: `app/settings/settings-client.tsx`
- Create: `lib/push-client.ts`

- [ ] **Step 1: Add shadcn pieces**

```bash
pnpm dlx shadcn@latest add switch card separator
```

- [ ] **Step 2: Implement `lib/push-client.ts`**

```ts
'use client'

export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const safe = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(safe)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as { standalone?: boolean }).standalone === true
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) && !(window as { MSStream?: unknown }).MSStream
}

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
}
```

- [ ] **Step 3: Implement `app/settings/settings-client.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { urlBase64ToUint8Array, isIOS, isStandalone, pushSupported } from '@/lib/push-client'
import { subscribeUser, unsubscribeUser, setNotifPrefs } from '@/app/actions/push'
import { logout } from '@/app/actions/auth'

interface Props {
  apartment: string
  initialReminder: boolean
  initialFreed: boolean
}

export function SettingsClient({ apartment, initialReminder, initialFreed }: Props) {
  const [supported, setSupported] = useState(false)
  const [iosBlocked, setIosBlocked] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [reminder, setReminder] = useState(initialReminder)
  const [freed, setFreed] = useState(initialFreed)
  const [installPromptEvt, setInstallPromptEvt] = useState<Event | null>(null)

  useEffect(() => {
    setSupported(pushSupported())
    setIosBlocked(isIOS() && !isStandalone())
    if (pushSupported()) {
      navigator.serviceWorker.ready.then((reg) => reg.pushManager.getSubscription().then((s) => setSubscribed(!!s)))
    }
    const onInstall = (e: Event) => { e.preventDefault(); setInstallPromptEvt(e) }
    window.addEventListener('beforeinstallprompt', onInstall)
    return () => window.removeEventListener('beforeinstallprompt', onInstall)
  }, [])

  async function enablePush() {
    if (iosBlocked) {
      toast.message('Tilføj appen til hjemmeskærm først', { description: 'Tryk på del-ikonet i Safari og vælg "Tilføj til hjemmeskærm".' })
      return
    }
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
    })
    const json = sub.toJSON()
    const res = await subscribeUser({
      endpoint: json.endpoint!,
      p256dh: json.keys!.p256dh,
      auth: json.keys!.auth,
    })
    if (!res.ok) { toast.error('Kunne ikke aktivere notifikationer'); return }
    setSubscribed(true)
    toast.success('Notifikationer slået til')
  }

  async function disablePush() {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      await unsubscribeUser(sub.endpoint)
      await sub.unsubscribe()
    }
    setSubscribed(false)
  }

  async function onReminderChange(v: boolean) {
    setReminder(v)
    await setNotifPrefs({ reminder: v })
  }

  async function onFreedChange(v: boolean) {
    setFreed(v)
    await setNotifPrefs({ freed: v })
  }

  async function install() {
    if (!installPromptEvt) return
    await (installPromptEvt as { prompt: () => Promise<unknown> }).prompt()
    setInstallPromptEvt(null)
  }

  return (
    <div className="mx-auto max-w-md space-y-4 p-6">
      <Card>
        <CardHeader><CardTitle>Lejlighed</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-between">
          <span>{apartment}</span>
          <a href="/onboarding" className="text-sm text-primary underline-offset-4 hover:underline">Skift</a>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Notifikationer</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {!supported && <p className="text-sm text-muted-foreground">Push-notifikationer kræver en moderne browser.</p>}
          {supported && iosBlocked && (
            <p className="text-sm text-muted-foreground">Tilføj appen til hjemmeskærm for at aktivere notifikationer.</p>
          )}
          {supported && !iosBlocked && (
            <>
              <div className="flex items-center justify-between">
                <Label>Push aktiveret</Label>
                <Switch checked={subscribed} onCheckedChange={(v) => v ? enablePush() : disablePush()} />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <Label htmlFor="reminder">Påmindelse 30 min før vasketid</Label>
                <Switch id="reminder" disabled={!subscribed} checked={reminder} onCheckedChange={onReminderChange} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="freed">Besked når vagtede tider bliver ledige</Label>
                <Switch id="freed" disabled={!subscribed} checked={freed} onCheckedChange={onFreedChange} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>App</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {installPromptEvt && <Button onClick={install} className="w-full">Tilføj til hjemmeskærm</Button>}
          {isIOS() && !isStandalone() && (
            <p className="text-sm text-muted-foreground">På iPhone: tryk på del-ikonet i Safari → "Tilføj til hjemmeskærm".</p>
          )}
          <form action={logout}>
            <Button type="submit" variant="outline" className="w-full">Log ud</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 4: Implement `app/settings/page.tsx`**

```tsx
import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { db, schema } from '@/db'
import { getSession } from '@/lib/auth'
import { SettingsClient } from './settings-client'

export default async function SettingsPage() {
  const session = await getSession()
  if (!session) redirect('/onboarding')
  const subs = await db
    .select()
    .from(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.deviceId, session.deviceId))
    .limit(1)
  const sub = subs[0]
  return (
    <SettingsClient
      apartment={session.apartment}
      initialReminder={sub?.reminderEnabled ?? true}
      initialFreed={sub?.freedSlotEnabled ?? true}
    />
  )
}
```

- [ ] **Step 5: Manual smoke**

```bash
pnpm dev --experimental-https
```
Visit `/settings` (after onboarding). Toggle push. Browser permission prompt. Confirm subscription persists in Neon (`select * from push_subscriptions`). Toggle reminders + freed flags off and on.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: settings page with push toggles, ios install nudge, logout"
```

---

## Task 14: Home calendar with slot list

**Files:**
- Create: `app/page.tsx` (server)
- Create: `app/_home/calendar.tsx` (client)
- Create: `app/_home/slot-button.tsx` (client)
- Create: `app/_home/booking-dialog.tsx` (client)

- [ ] **Step 1: Add shadcn pieces**

```bash
pnpm dlx shadcn@latest add calendar dialog drawer skeleton tooltip
```

- [ ] **Step 2: Implement `app/page.tsx`** (server)

```tsx
import { and, gte, lte } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { db, schema } from '@/db'
import { getSession } from '@/lib/auth'
import { todayInCph } from '@/lib/time'
import { HomeClient } from './_home/calendar'

export default async function HomePage({ searchParams }: { searchParams: Promise<{ date?: string; hour?: string }> }) {
  const session = await getSession()
  if (!session) redirect('/onboarding')
  const today = todayInCph()
  const horizonEnd = new Date(today + 'T00:00:00Z')
  horizonEnd.setUTCDate(horizonEnd.getUTCDate() + 14)
  const end = horizonEnd.toISOString().slice(0, 10)

  const bookings = await db
    .select()
    .from(schema.bookings)
    .where(and(gte(schema.bookings.date, today), lte(schema.bookings.date, end)))

  const sp = await searchParams
  return (
    <HomeClient
      apartment={session.apartment}
      bookings={bookings.map((b) => ({ id: b.id, apartment: b.apartment, date: b.date, hour: b.hour }))}
      focus={sp.date && sp.hour ? { date: sp.date, hour: Number(sp.hour) } : null}
    />
  )
}
```

- [ ] **Step 3: Implement `app/_home/calendar.tsx`**

```tsx
'use client'

import { useMemo, useState } from 'react'
import { Calendar } from '@/components/ui/calendar'
import { da } from 'date-fns/locale'
import { todayInCph, fmtDayDanish } from '@/lib/time'
import type { Apartment } from '@/lib/apartments'
import { SlotList } from './slot-button'

export interface BookingLite { id: string; apartment: string; date: string; hour: number }

interface Props {
  apartment: Apartment
  bookings: BookingLite[]
  focus: { date: string; hour: number } | null
}

export function HomeClient({ apartment, bookings, focus }: Props) {
  const today = todayInCph()
  const [selected, setSelected] = useState<Date>(() => focus ? new Date(focus.date + 'T12:00:00') : new Date(today + 'T12:00:00'))
  const dateStr = useMemo(() => selected.toISOString().slice(0, 10), [selected])

  const fullyBookedDates = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const b of bookings) counts[b.date] = (counts[b.date] ?? 0) + 1
    return Object.entries(counts).filter(([, n]) => n >= 15).map(([d]) => new Date(d + 'T12:00:00'))
  }, [bookings])

  const dayBookings = bookings.filter((b) => b.date === dateStr)

  return (
    <div className="mx-auto grid max-w-3xl gap-6 p-4 md:grid-cols-2">
      <Calendar
        mode="single"
        selected={selected}
        onSelect={(d) => d && setSelected(d)}
        locale={da}
        weekStartsOn={1}
        modifiers={{ booked: fullyBookedDates }}
        modifiersClassNames={{ booked: 'line-through opacity-60' }}
        disabled={(d) => {
          const iso = d.toISOString().slice(0, 10)
          if (iso < today) return true
          const horizon = new Date(today + 'T12:00:00'); horizon.setDate(horizon.getDate() + 14)
          return d > horizon
        }}
      />

      <div>
        <h2 className="mb-3 text-lg font-medium first-letter:uppercase">{fmtDayDanish(dateStr)}</h2>
        <SlotList
          apartment={apartment}
          date={dateStr}
          dayBookings={dayBookings}
          focusHour={focus?.date === dateStr ? focus.hour : null}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Implement `app/_home/slot-button.tsx`**

```tsx
'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { apartmentColor, type Apartment } from '@/lib/apartments'
import { isPastSlot } from '@/lib/time'
import { createBooking, cancelBooking } from '@/app/actions/bookings'
import { watchSlot } from '@/app/actions/push'
import { DANISH_MESSAGES } from '@/lib/errors'
import { BookingDialog } from './booking-dialog'
import type { BookingLite } from './calendar'

interface Props {
  apartment: Apartment
  date: string
  dayBookings: BookingLite[]
  focusHour: number | null
}

const HOURS = Array.from({ length: 15 }, (_, i) => i + 7) // 7..21

export function SlotList({ apartment, date, dayBookings, focusHour }: Props) {
  const myCount = dayBookings.filter((b) => b.apartment === apartment).length
  const [pending, start] = useTransition()
  const [confirmAction, setConfirmAction] = useState<{ kind: 'book' | 'cancel' | 'watch'; hour: number; bookingId?: string } | null>(null)
  const focusRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    focusRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [focusHour])

  function handleClick(hour: number) {
    if (isPastSlot(date, hour)) return
    const b = dayBookings.find((x) => x.hour === hour)
    if (!b) {
      if (myCount >= 3) { toast(DANISH_MESSAGES.MAX_3H_PER_DAY); return }
      setConfirmAction({ kind: 'book', hour })
    } else if (b.apartment === apartment) {
      setConfirmAction({ kind: 'cancel', hour, bookingId: b.id })
    } else {
      setConfirmAction({ kind: 'watch', hour })
    }
  }

  async function confirm() {
    if (!confirmAction) return
    start(async () => {
      let res: { ok: boolean; code?: string }
      if (confirmAction.kind === 'book') res = await createBooking({ date, hour: confirmAction.hour })
      else if (confirmAction.kind === 'cancel') res = await cancelBooking({ id: confirmAction.bookingId! })
      else res = await watchSlot({ date, hour: confirmAction.hour })
      if (!res.ok) toast.error(DANISH_MESSAGES[res.code as keyof typeof DANISH_MESSAGES] ?? 'Ukendt fejl')
      else if (confirmAction.kind === 'book') toast.success('Booket')
      else if (confirmAction.kind === 'cancel') toast.success('Annulleret')
      else toast.success('Du får besked hvis tiden bliver ledig')
      setConfirmAction(null)
    })
  }

  return (
    <>
      <ul className="space-y-1">
        {HOURS.map((h) => {
          const b = dayBookings.find((x) => x.hour === h)
          const past = isPastSlot(date, h)
          const mine = b?.apartment === apartment
          const isFocus = focusHour === h
          const label = `${String(h).padStart(2, '0')}:00–${String(h + 1).padStart(2, '0')}:00`

          return (
            <li key={h}>
              <Button
                ref={isFocus ? focusRef : null}
                variant={mine ? 'default' : b ? 'secondary' : 'outline'}
                disabled={past || (!b && myCount >= 3)}
                onClick={() => handleClick(h)}
                className={`w-full justify-between ${isFocus ? 'ring-2 ring-primary' : ''}`}
              >
                <span>{label}</span>
                {b && (
                  <span className="flex items-center gap-2 text-xs">
                    <span className="size-2 rounded-full" style={{ background: apartmentColor(b.apartment as Apartment) }} />
                    {b.apartment}
                  </span>
                )}
                {!b && !past && <span className="text-xs text-muted-foreground">ledig</span>}
                {past && <span className="text-xs text-muted-foreground">forbi</span>}
              </Button>
            </li>
          )
        })}
      </ul>

      <BookingDialog
        action={confirmAction}
        date={date}
        apartment={apartment}
        booker={confirmAction ? dayBookings.find((b) => b.hour === confirmAction.hour)?.apartment : undefined}
        pending={pending}
        onConfirm={confirm}
        onClose={() => setConfirmAction(null)}
      />
    </>
  )
}
```

- [ ] **Step 5: Implement `app/_home/booking-dialog.tsx`**

```tsx
'use client'

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { fmtSlotDanish } from '@/lib/time'
import type { Apartment } from '@/lib/apartments'

interface Props {
  action: { kind: 'book' | 'cancel' | 'watch'; hour: number } | null
  date: string
  apartment: Apartment
  booker?: string
  pending: boolean
  onConfirm: () => void
  onClose: () => void
}

export function BookingDialog({ action, date, apartment, booker, pending, onConfirm, onClose }: Props) {
  if (!action) return null
  const slot = fmtSlotDanish(date, action.hour)

  const titleMap = { book: 'Book vasketid?', cancel: 'Annullér booking?', watch: 'Få besked hvis ledig?' }
  const ctaMap = { book: 'Bekræft booking', cancel: 'Annullér booking', watch: 'Giv mig besked' }
  const descMap: Record<typeof action.kind, string> = {
    book: `${slot} for ${apartment}`,
    cancel: `${slot}. Naboer der venter på denne tid får besked hvis du annullerer.`,
    watch: `${slot} er booket af ${booker ?? '?'}.`,
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titleMap[action.kind]}</DialogTitle>
          <DialogDescription>{descMap[action.kind]}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Luk</Button>
          <Button onClick={onConfirm} disabled={pending}>{pending ? '…' : ctaMap[action.kind]}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 6: Smoke test**

```bash
pnpm dev --experimental-https
```
- Pick a date, book a slot. See toast + UI updates.
- Try 4th booking same day → blocked toast.
- Cancel a slot → it returns to "ledig".
- Tap a different apartment's booked slot → watch dialog.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: home calendar with slot booking, cancel, and watch flows"
```

---

## Task 15: My bookings + watching list

**Files:**
- Create: `app/bookings/page.tsx`
- Create: `app/bookings/bookings-client.tsx`

- [ ] **Step 1: Add shadcn pieces**

```bash
pnpm dlx shadcn@latest add accordion
```

- [ ] **Step 2: Implement `app/bookings/page.tsx`**

```tsx
import { and, eq, gte, lt } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { db, schema } from '@/db'
import { getSession } from '@/lib/auth'
import { todayInCph } from '@/lib/time'
import { BookingsClient } from './bookings-client'

export default async function BookingsPage() {
  const session = await getSession()
  if (!session) redirect('/onboarding')
  const today = todayInCph()

  const upcoming = await db
    .select()
    .from(schema.bookings)
    .where(and(eq(schema.bookings.apartment, session.apartment), gte(schema.bookings.date, today)))
    .orderBy(schema.bookings.date, schema.bookings.hour)

  const history = await db
    .select()
    .from(schema.bookings)
    .where(and(eq(schema.bookings.apartment, session.apartment), lt(schema.bookings.date, today)))
    .orderBy(schema.bookings.date, schema.bookings.hour)
    .limit(30)

  const watches = await db
    .select()
    .from(schema.slotWatches)
    .where(eq(schema.slotWatches.deviceId, session.deviceId))
    .orderBy(schema.slotWatches.date, schema.slotWatches.hour)

  // For each watch, find who has the slot
  const watchesWithBooker = await Promise.all(watches.map(async (w) => {
    const [b] = await db
      .select({ apartment: schema.bookings.apartment })
      .from(schema.bookings)
      .where(and(eq(schema.bookings.date, w.date), eq(schema.bookings.hour, w.hour)))
      .limit(1)
    return { ...w, booker: b?.apartment }
  }))

  return <BookingsClient upcoming={upcoming} history={history} watches={watchesWithBooker} />
}
```

- [ ] **Step 3: Implement `app/bookings/bookings-client.tsx`**

```tsx
'use client'

import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { toast } from 'sonner'
import { fmtSlotDanish } from '@/lib/time'
import { cancelBooking } from '@/app/actions/bookings'
import { unwatchSlot } from '@/app/actions/push'
import { DANISH_MESSAGES } from '@/lib/errors'

interface BookingRow { id: string; apartment: string; date: string; hour: number }
interface WatchRow { id: string; date: string; hour: number; booker?: string }

export function BookingsClient({ upcoming, history, watches }: { upcoming: BookingRow[]; history: BookingRow[]; watches: WatchRow[] }) {
  const [pending, start] = useTransition()

  function onCancel(id: string) {
    start(async () => {
      const res = await cancelBooking({ id })
      if (!res.ok) toast.error(DANISH_MESSAGES[res.code] ?? 'Fejl')
      else toast.success('Annulleret')
    })
  }

  function onUnwatch(date: string, hour: number) {
    start(async () => {
      await unwatchSlot({ date, hour })
      toast('Vagt fjernet')
    })
  }

  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <Card>
        <CardHeader><CardTitle>Mine bookinger</CardTitle></CardHeader>
        <CardContent>
          {upcoming.length === 0 && <p className="text-sm text-muted-foreground">Ingen kommende bookinger.</p>}
          <ul className="space-y-2">
            {upcoming.map((b) => (
              <li key={b.id} className="flex items-center justify-between rounded-md border p-2">
                <span className="text-sm">{fmtSlotDanish(b.date, b.hour)}</span>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => onCancel(b.id)}>Annullér</Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Vagter</CardTitle></CardHeader>
        <CardContent>
          {watches.length === 0 && <p className="text-sm text-muted-foreground">Ingen vagter.</p>}
          <ul className="space-y-2">
            {watches.map((w) => (
              <li key={w.id} className="flex items-center justify-between rounded-md border p-2">
                <span className="text-sm">
                  {fmtSlotDanish(w.date, w.hour)}{w.booker ? ` · booket af ${w.booker}` : ' · ledig'}
                </span>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => onUnwatch(w.date, w.hour)}>Stop</Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Accordion type="single" collapsible>
        <AccordionItem value="history">
          <AccordionTrigger>Historik (sidste 30)</AccordionTrigger>
          <AccordionContent>
            <ul className="space-y-1">
              {history.map((b) => (
                <li key={b.id} className="text-sm text-muted-foreground">{fmtSlotDanish(b.date, b.hour)}</li>
              ))}
              {history.length === 0 && <p className="text-sm">Ingen historik.</p>}
            </ul>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}
```

- [ ] **Step 4: Smoke test**

After booking some slots in Task 14, navigate to `/bookings`. Cancel one — it should disappear and a toast shows.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: my bookings, watching, and history page"
```

---

## Task 16: Cron — reminders + cleanup

**Files:**
- Create: `app/api/cron/reminders/route.ts`
- Create: `app/api/cron/cleanup/route.ts`
- Create: `vercel.json`

- [ ] **Step 1: Implement `app/api/cron/reminders/route.ts`**

```ts
import 'server-only'
import { and, eq, isNull, lte, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { sendReminderPush } from '@/lib/push'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`)
    return new Response('Unauthorized', { status: 401 })

  const due = await db
    .select({
      bookingId: schema.reminderJobs.bookingId,
      date: schema.bookings.date,
      hour: schema.bookings.hour,
      apartment: schema.bookings.apartment,
    })
    .from(schema.reminderJobs)
    .innerJoin(schema.bookings, eq(schema.reminderJobs.bookingId, schema.bookings.id))
    .where(and(isNull(schema.reminderJobs.sentAt), lte(schema.reminderJobs.fireAt, sql`now() + interval '5 minutes'`)))

  let sent = 0
  for (const job of due) {
    const subs = await db
      .select({
        endpoint: schema.pushSubscriptions.endpoint,
        p256dh: schema.pushSubscriptions.p256dh,
        auth: schema.pushSubscriptions.auth,
      })
      .from(schema.pushSubscriptions)
      .where(and(
        eq(schema.pushSubscriptions.apartment, job.apartment),
        eq(schema.pushSubscriptions.reminderEnabled, true),
      ))
    for (const s of subs) {
      await sendReminderPush(s, job.bookingId, job.date, job.hour)
      sent++
    }
    await db
      .update(schema.reminderJobs)
      .set({ sentAt: new Date() })
      .where(eq(schema.reminderJobs.bookingId, job.bookingId))
  }

  return Response.json({ ok: true, jobsProcessed: due.length, pushesSent: sent })
}
```

- [ ] **Step 2: Implement `app/api/cron/cleanup/route.ts`**

```ts
import 'server-only'
import { lt, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { todayInCph } from '@/lib/time'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`)
    return new Response('Unauthorized', { status: 401 })

  const today = todayInCph()
  const watchesDeleted = await db.delete(schema.slotWatches).where(lt(schema.slotWatches.date, today)).returning({ id: schema.slotWatches.id })
  const remindersDeleted = await db.delete(schema.reminderJobs).where(sql`${schema.reminderJobs.sentAt} is not null and ${schema.reminderJobs.sentAt} < now() - interval '7 days'`).returning({ id: schema.reminderJobs.bookingId })
  const ninetyDaysAgo = new Date(); ninetyDaysAgo.setUTCDate(ninetyDaysAgo.getUTCDate() - 90)
  const oldDate = ninetyDaysAgo.toISOString().slice(0, 10)
  const bookingsDeleted = await db.delete(schema.bookings).where(lt(schema.bookings.date, oldDate)).returning({ id: schema.bookings.id })

  return Response.json({
    ok: true,
    watchesDeleted: watchesDeleted.length,
    remindersDeleted: remindersDeleted.length,
    bookingsDeleted: bookingsDeleted.length,
  })
}
```

- [ ] **Step 3: Write `vercel.json`**

```json
{
  "crons": [
    { "path": "/api/cron/reminders", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/cleanup",   "schedule": "0 3 * * *" }
  ]
}
```

- [ ] **Step 4: Manual local invocation**

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/reminders
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/cleanup
```

Expected JSON responses with counts.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: vercel cron for reminders and cleanup"
```

---

## Task 17: Deploy + cron fallback if Hobby blocks `*/5`

**Files:** none new unless fallback needed.

- [ ] **Step 1: Push to GitHub + connect Vercel project**

```bash
gh repo create vaskebooking --private --source=. --remote=origin --push
```
Then in Vercel dashboard: import the repo, set env vars from `.env.example`.

- [ ] **Step 2: Set Neon prod branch DATABASE_URL in Vercel; run `pnpm db:push` once locally against the prod URL to create tables.**

- [ ] **Step 3: First deploy**

If Vercel rejects `*/5 * * * *` because of Hobby plan limits, the build will fail. Do this fallback:

```yaml
# .github/workflows/cron.yml
name: Reminder cron
on:
  schedule:
    - cron: '*/5 * * * *'
  workflow_dispatch:
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -fsS -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            "${{ secrets.APP_URL }}/api/cron/reminders"
```

Add `APP_URL` and `CRON_SECRET` to GitHub secrets. Remove `reminders` from `vercel.json` (keep `cleanup` daily, which Hobby allows). Redeploy.

- [ ] **Step 4: End-to-end push test**

- Install the PWA on an iPhone (Safari → Share → Add to Home Screen).
- Open it from home screen, enable push in Settings.
- Book a slot 31 minutes in the future.
- Wait — within 5 min of T-30 the push arrives.
- Have a second device/apartment cancel a slot the first device watches → push arrives.

- [ ] **Step 5: Commit any deploy-related changes**

```bash
git add -A
git commit -m "chore: deploy config and cron fallback notes"
```

---

## Self-review log

**Spec coverage**

| Spec section | Task |
|---|---|
| 1 Architecture / file tree | Tasks 1–17 collectively |
| 2 Data model | Task 6 |
| 3 createBooking / cancelBooking transactions | Task 9 |
| 3 Watching rules (no own apt, unlimited, no day cap) | Task 11 (`watchSlot`) |
| 3 Push send semantics (404/410 prune) | Task 10 |
| 4 Onboarding screen | Task 8 |
| 4 Home calendar | Task 14 |
| 4 Booking/cancel/watch dialogs | Task 14 |
| 4 My bookings + Vagter + Historik | Task 15 |
| 4 Settings (apt, push toggles, install, logout) | Task 13 |
| 4 Vibe (Danish, dark mode, per-apt color) | Tasks 3, 4 (locale), 14 (color dots), Task 1 (dark via tailwind default) |
| 5 VAPID + sw.js | Task 12 |
| 5 Subscription lifecycle | Tasks 11, 13 |
| 5 Payloads + tag dedupe | Task 10 |
| 5 iOS detection | Task 13 |
| 6 Cron schedules + auth | Task 16 |
| 6 Cleanup logic | Task 16 |
| 7 Validation rules table | Task 5 (rules) + Task 9 (mapping in actions) |
| 8 Security headers | Task 12 |
| 9 Local dev | Notes section + Tasks 1, 6, 8 |
| 10 Out of scope (offline) | Honored — no offline code anywhere |
| 11 Decisions log | Reflected in implementation choices |

No gaps.

**Type consistency** — `RuleCode` used uniformly across `lib/errors.ts`, `app/actions/auth.ts`, `app/actions/bookings.ts`, `app/actions/push.ts`. `SubscriptionRow` used in `lib/push.ts` and the cron handler. `Apartment` used everywhere via `@/lib/apartments`.

**Placeholder scan** — no TBDs or "implement later." Two intentional self-corrections (Task 4 step 5, Task 9 step 4) call out a deliberate fix-then-improve cycle so the engineer doesn't have to guess.

**Known sharp edges, called out for the implementer:**
- Task 12 step 3 uses ImageMagick which may not be installed; engineer is told to ship blank PNGs and replace later.
- Task 17 explicitly addresses the Vercel Hobby `*/5` cron restriction with a GitHub Actions fallback.
