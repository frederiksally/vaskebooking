import { and, gte, lte } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { db, schema } from '@/db'
import { getSession } from '@/lib/auth'
import { todayInCph } from '@/lib/time'
import { HomeClient } from './_home/calendar'

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; hour?: string }>
}) {
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
