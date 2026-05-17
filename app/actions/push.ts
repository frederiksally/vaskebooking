'use server'

import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { getSession } from '@/lib/auth'
import type { RuleCode } from '@/lib/errors'

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
      set: {
        apartment: session.apartment,
        deviceId: session.deviceId,
        p256dh: parsed.data.p256dh,
        auth: parsed.data.auth,
      },
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
