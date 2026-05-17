import { RuleError } from '@/lib/errors'
import { isPastSlot, daysFromTodayCph } from '@/lib/time'

export const FIRST_HOUR = 7
export const LAST_HOUR = 21          // last *start* hour; 21:00–22:00 is the last slot
export const MAX_HOURS_PER_DAY = 3
export const MAX_HORIZON_DAYS = 14

export interface BookableInput {
  date: string
  hour: number
  sameDayCount: number
  now?: Date
}

export function assertBookable({ date, hour, sameDayCount, now = new Date() }: BookableInput): void {
  if (hour < FIRST_HOUR || hour > LAST_HOUR) throw new RuleError('OUT_OF_HOURS')
  if (isPastSlot(date, hour, now)) throw new RuleError('PAST_SLOT')
  if (daysFromTodayCph(date, now) > MAX_HORIZON_DAYS) throw new RuleError('HORIZON_EXCEEDED')
  if (sameDayCount >= MAX_HOURS_PER_DAY) throw new RuleError('MAX_3H_PER_DAY')
}
