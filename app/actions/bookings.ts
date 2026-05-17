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

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; code: RuleCode }

const CreateSchema = z.object({ date: z.string(), hour: z.number().int() })
const CancelSchema = z.object({ id: z.string().uuid() })

function pgErrorCode(e: unknown): string | undefined {
  return typeof e === 'object' && e !== null && 'code' in e
    ? (e as { code?: string }).code
    : undefined
}

async function withSerializableRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if (pgErrorCode(e) === '40001') return await fn()
    throw e
  }
}

export async function createBooking(
  input: { date: string; hour: number }
): Promise<ActionResult<{ id: string }>> {
  const parsed = CreateSchema.safeParse(input)
  if (!parsed.success) return { ok: false, code: 'OUT_OF_HOURS' }
  const session = await getSession()
  if (!session) return { ok: false, code: 'NOT_FOUND_OR_NOT_YOURS' }

  try {
    const id = await withSerializableRetry(() =>
      db.transaction(async (tx) => {
        const sameDay = await tx
          .select({ id: schema.bookings.id })
          .from(schema.bookings)
          .where(and(
            eq(schema.bookings.apartment, session.apartment),
            eq(schema.bookings.date, parsed.data.date),
          ))

        assertBookable({
          date: parsed.data.date,
          hour: parsed.data.hour,
          sameDayCount: sameDay.length,
        })

        const [row] = await tx
          .insert(schema.bookings)
          .values({
            apartment: session.apartment,
            date: parsed.data.date,
            hour: parsed.data.hour,
          })
          .returning({ id: schema.bookings.id })

        await tx.insert(schema.reminderJobs).values({
          bookingId: row.id,
          fireAt: reminderFireUtc(parsed.data.date, parsed.data.hour),
        })
        return row.id
      }, { isolationLevel: 'serializable' }),
    )
    revalidatePath('/')
    revalidatePath('/bookings')
    return { ok: true, data: { id } }
  } catch (e) {
    if (e instanceof RuleError) return { ok: false, code: e.code }
    if (pgErrorCode(e) === '23505') return { ok: false, code: 'SLOT_TAKEN' }
    throw e
  }
}

export async function cancelBooking(
  input: { id: string }
): Promise<ActionResult> {
  const parsed = CancelSchema.safeParse(input)
  if (!parsed.success) return { ok: false, code: 'NOT_FOUND_OR_NOT_YOURS' }
  const session = await getSession()
  if (!session) return { ok: false, code: 'NOT_FOUND_OR_NOT_YOURS' }

  try {
    const { date, hour, watchers } = await db.transaction(async (tx) => {
      const [deleted] = await tx
        .delete(schema.bookings)
        .where(and(
          eq(schema.bookings.id, parsed.data.id),
          eq(schema.bookings.apartment, session.apartment),
        ))
        .returning()
      if (!deleted) throw new RuleError('NOT_FOUND_OR_NOT_YOURS')

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

      await tx.delete(schema.slotWatches).where(and(
        eq(schema.slotWatches.date, deleted.date),
        eq(schema.slotWatches.hour, deleted.hour),
      ))

      return { date: deleted.date, hour: deleted.hour, watchers }
    })

    // Push fan-out outside the tx — failures are non-fatal.
    // A single device with N subscriptions intentionally gets N pushes (one per install).
    await Promise.allSettled(watchers.map((w) => sendFreedSlotPush(w, date, hour)))

    revalidatePath('/')
    revalidatePath('/bookings')
    return { ok: true }
  } catch (e) {
    if (e instanceof RuleError) return { ok: false, code: e.code }
    throw e
  }
}

export async function listMyBookings() {
  const session = await getSession()
  if (!session) return []
  const today = todayInCph()
  return db
    .select()
    .from(schema.bookings)
    .where(and(
      eq(schema.bookings.apartment, session.apartment),
      gte(schema.bookings.date, today),
    ))
    .orderBy(schema.bookings.date, schema.bookings.hour)
}
