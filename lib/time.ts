import { fromZonedTime, formatInTimeZone } from 'date-fns-tz'
import { da } from 'date-fns/locale'

export const TZ = 'Europe/Copenhagen'

export function slotStartUtc(date: string, hour: number): Date {
  return fromZonedTime(`${date} ${String(hour).padStart(2, '0')}:00:00`, TZ)
}

export function reminderFireUtc(date: string, hour: number): Date {
  return new Date(slotStartUtc(date, hour).getTime() - 30 * 60 * 1000)
}

export function isPastSlot(date: string, hour: number, now: Date = new Date()): boolean {
  return slotStartUtc(date, hour).getTime() < now.getTime()
}

export function fmtDayDanish(date: string): string {
  const start = slotStartUtc(date, 0)
  return formatInTimeZone(start, TZ, 'EEEE d. MMMM', { locale: da })
}

export function fmtSlotDanish(date: string, hour: number): string {
  const start = String(hour).padStart(2, '0')
  const next = String(hour + 1).padStart(2, '0')
  return `${fmtDayDanish(date)} kl. ${start}:00–${next}:00`
}

export function todayInCph(now: Date = new Date()): string {
  return formatInTimeZone(now, TZ, 'yyyy-MM-dd')
}

export function daysFromTodayCph(date: string, now: Date = new Date()): number {
  // Both inputs are CPH-local YYYY-MM-DD strings. We materialize them as UTC
  // midnights solely to count whole days between them; no UTC day ever crosses
  // a DST gap, so the integer-day division is exact.
  const today = todayInCph(now)
  const toUtc = (s: string) => {
    const [y, m, d] = s.split('-').map(Number) as [number, number, number]
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((toUtc(date) - toUtc(today)) / 86_400_000)
}
