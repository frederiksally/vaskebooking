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
