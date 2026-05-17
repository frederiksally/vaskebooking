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
  // Raw SQL predicate uses physical column name (sent_at), not the JS property (sentAt).
  pendingIdx: index('reminder_pending_idx').on(t.fireAt).where(sql`sent_at is null`),
}))
