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

  // For each watch, find who currently has that slot.
  const watchesWithBooker = await Promise.all(
    watches.map(async (w) => {
      const [b] = await db
        .select({ apartment: schema.bookings.apartment })
        .from(schema.bookings)
        .where(and(eq(schema.bookings.date, w.date), eq(schema.bookings.hour, w.hour)))
        .limit(1)
      return { ...w, booker: b?.apartment as string | undefined }
    }),
  )

  return <BookingsClient upcoming={upcoming} history={history} watches={watchesWithBooker} />
}
