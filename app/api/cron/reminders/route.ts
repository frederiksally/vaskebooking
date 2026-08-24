import 'server-only'
import { and, eq, inArray, isNull, lte, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { sendReminderPush } from '@/lib/push'

export const runtime = 'nodejs'

// Look-ahead window: a job is claimed once fireAt is within this many minutes of
// now. It must be >= the external scheduler's poll interval, otherwise a job
// whose fireAt lands between two polls would be sent late. Defaults to 5 min to
// preserve historical behaviour; override via CRON_LOOKAHEAD_MINUTES if the
// scheduler interval changes.
const LOOKAHEAD_MINUTES = Number(process.env.CRON_LOOKAHEAD_MINUTES ?? '5')

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`)
    return new Response('Unauthorized', { status: 401 })

  // Atomic claim: mark all due jobs as sent BEFORE dispatching. If the cron
  // is retried (e.g. timeout), only freshly-pending jobs get picked up; already-
  // claimed jobs are skipped, preventing duplicate notifications.
  const claimed = await db
    .update(schema.reminderJobs)
    .set({ sentAt: new Date() })
    .where(and(
      isNull(schema.reminderJobs.sentAt),
      lte(schema.reminderJobs.fireAt, sql`now() + make_interval(mins => ${LOOKAHEAD_MINUTES})`),
    ))
    .returning({ bookingId: schema.reminderJobs.bookingId })

  if (claimed.length === 0) {
    return Response.json({ ok: true, jobsProcessed: 0, pushesSent: 0 })
  }

  const claimedIds = claimed.map((r) => r.bookingId)
  const jobs = await db
    .select({
      bookingId: schema.bookings.id,
      date: schema.bookings.date,
      hour: schema.bookings.hour,
      apartment: schema.bookings.apartment,
    })
    .from(schema.bookings)
    .where(inArray(schema.bookings.id, claimedIds))

  let sent = 0
  for (const job of jobs) {
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
    await Promise.allSettled(
      subs.map((s) => sendReminderPush(s, job.bookingId, job.date, job.hour)),
    )
    sent += subs.length
  }

  return Response.json({ ok: true, jobsProcessed: jobs.length, pushesSent: sent })
}
