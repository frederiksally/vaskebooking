import 'server-only'
import { lt, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { todayInCph } from '@/lib/time'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`)
    return new Response('Unauthorized', { status: 401 })

  const today = todayInCph()

  const watchesDeleted = await db
    .delete(schema.slotWatches)
    .where(lt(schema.slotWatches.date, today))
    .returning({ id: schema.slotWatches.id })

  const remindersDeleted = await db
    .delete(schema.reminderJobs)
    .where(sql`${schema.reminderJobs.sentAt} is not null and ${schema.reminderJobs.sentAt} < now() - interval '7 days'`)
    .returning({ id: schema.reminderJobs.bookingId })

  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setUTCDate(ninetyDaysAgo.getUTCDate() - 90)
  const oldDate = ninetyDaysAgo.toISOString().slice(0, 10)
  const bookingsDeleted = await db
    .delete(schema.bookings)
    .where(lt(schema.bookings.date, oldDate))
    .returning({ id: schema.bookings.id })

  return Response.json({
    ok: true,
    watchesDeleted: watchesDeleted.length,
    remindersDeleted: remindersDeleted.length,
    bookingsDeleted: bookingsDeleted.length,
  })
}
