import 'server-only'
import webpush, { type PushSubscription as WebPushSubscription } from 'web-push'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { fmtSlotDanish, fmtDayDanish } from '@/lib/time'

let configured = false
function ensureConfigured() {
  if (configured) return
  if (!process.env.VAPID_CONTACT || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    throw new Error('VAPID env vars missing (VAPID_CONTACT, NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)')
  }
  webpush.setVapidDetails(
    process.env.VAPID_CONTACT,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
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

// Never throws: callers (cron, server actions) treat push as best-effort.
export async function sendPush(sub: SubscriptionRow, payload: PushPayload): Promise<void> {
  const tail = sub.endpoint.slice(-12)
  try {
    ensureConfigured()
  } catch (e) {
    console.error('push config error', { kind: payload.kind, endpoint: tail }, e)
    return
  }
  const target: WebPushSubscription = {
    endpoint: sub.endpoint,
    keys: { p256dh: sub.p256dh, auth: sub.auth },
  }
  try {
    await webpush.sendNotification(target, JSON.stringify(payload))
  } catch (e: unknown) {
    const status = (e as { statusCode?: number }).statusCode
    if (status === 404 || status === 410) {
      // Endpoint is gone (uninstalled, browser data cleared, etc.) — prune.
      try {
        await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.endpoint, sub.endpoint))
      } catch (dbErr) {
        console.error('push prune failed', { endpoint: tail }, dbErr)
      }
    } else {
      console.error('push error', { kind: payload.kind, endpoint: tail, status }, e)
    }
  }
}

export async function sendReminderPush(
  sub: SubscriptionRow,
  bookingId: string,
  date: string,
  hour: number,
): Promise<void> {
  await sendPush(sub, {
    kind: 'reminder',
    bookingId,
    title: 'Vasketid om 30 min',
    body: `Din vasketid ${fmtSlotDanish(date, hour)} starter snart`,
    url: '/bookings',
    tag: `reminder:${bookingId}`,
  })
}

export async function sendFreedSlotPush(
  sub: SubscriptionRow,
  date: string,
  hour: number,
): Promise<void> {
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
