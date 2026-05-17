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
    .where(and(
      isNull(schema.reminderJobs.sentAt),
      lte(schema.reminderJobs.fireAt, sql`now() + interval '5 minutes'`),
    ))

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
